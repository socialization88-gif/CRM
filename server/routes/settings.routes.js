const express = require('express');

function createSettingsRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.get('/api/settings/permissions', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      try {
        const settings = await getPermissionSettings();
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Permission settings load failed', error: error.message });
      }
    });
    
    router.put('/api/settings/permissions', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const settings = await savePermissionSettings(req.user.id, req.body);
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(400).json({ ok: false, message: error.message });
      }
    });
    
    router.get('/api/settings/program', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const settings = await getProgramSettings();
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Program settings load failed', error: error.message });
      }
    });
    
    router.put('/api/settings/program', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const settings = await saveProgramSettings(req.user.id, req.body);
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(400).json({ ok: false, message: error.message });
      }
    });
    
    router.get('/api/settings/communication-connectors', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const settings = await getCommunicationConnectorSettings();
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Communication connector settings load failed', error: error.message });
      }
    });
    
    router.put('/api/settings/communication-connectors', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const settings = await saveCommunicationConnectorSettings(req.user.id, req.body);
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(400).json({ ok: false, message: error.message });
      }
    });
    
    router.get('/api/settings/overview-ads-banner', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      try {
        const data = await getOverviewAdsBannerSettings();
        res.json({ ok: true, settings: data.settings, updated_at: data.updated_at });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Overview banner settings load failed', error: error.message });
      }
    });
    
    router.put('/api/settings/overview-ads-banner', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const settings = await saveOverviewAdsBannerSettings(req.user.id, req.body);
        const data = await getOverviewAdsBannerSettings();
        res.json({ ok: true, settings, updated_at: data.updated_at });
      } catch (error) {
        res.status(400).json({ ok: false, message: error.message });
      }
    });
    
    router.get('/api/ai/settings', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_configure_ai) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const settings = await getAiSettingsRaw();
      res.json({ ok: true, settings: publicAiSettings(settings) });
    });
    
    router.put('/api/ai/settings', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_configure_ai) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const settings = await upsertAiSettings(req.user.id, req.body);
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(400).json({ ok: false, message: error.message });
      }
    });
    
    router.post('/api/ai/query', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_use_ai_chat) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const question = String(req.body.question || '').trim();
        const sessionId = normalizeChatSessionId(req.body.session_id);
        if (!question) return res.status(400).json({ ok: false, message: 'Question required' });
        if (!sessionId) return res.status(400).json({ ok: false, message: 'AI chat session id required' });
        const pageSize = toInt(req.body.pageSize, 50, 1, MAX_PAGE_SIZE);
        const plan = await translateQuestion(question);
        const result = await queryDatasetRows(req.user, plan.filters, 1, pageSize, { searchMode: plan.search_mode });
        const sqlPlan = buildDatasetWhere(req.user, plan.filters, { searchMode: plan.search_mode });
        const total = result.pagination.total || 0;
        const reply = total > 0
          ? buildAiMatchReply(plan, result.rows || [], total)
          : buildAiNoResultReply(plan);
        const preferredMatch = (result.rows || []).find((row) => isLikelyExactMatch(plan.filters.search, row)) || result.rows?.[0] || null;
        await client.query('BEGIN');
        const userMessage = await saveChatMessage(client, req.user.id, sessionId, 'user', escapeHtml(question).replace(/\n/g, '<br>'), {
          kind: 'question',
          source: 'chat_input',
        });
        const aiMessage = await saveChatMessage(client, req.user.id, sessionId, 'assistant', escapeHtml(reply).replace(/\n/g, '<br>'), {
          kind: 'reply',
          source: `langchain-${plan.source}`,
          total,
          filters: plan.filters,
        });
        await client.query('COMMIT');
        res.json({
          ok: true,
          source: `langchain-${plan.source}`,
          provider_error: plan.provider_error,
          explanation: plan.explanation,
          reply,
          total,
          session_id: sessionId,
          messages: [userMessage, aiMessage],
          filters: plan.filters,
          search_mode: plan.search_mode,
          preferred_profile_id: preferredMatch?.id || '',
          schema_keys: plan.schema.keys.map((k) => k.key),
          agent_steps: [
            { tool: 'schema_inspector', output: { table: 'public.dataset_rows', dataset_id: DATASET_ID, jsonb_keys: plan.schema.keys.map((k) => k.key) } },
            { tool: 'query_planner', output: { filters: plan.filters } },
            { tool: 'postgres_sql_tool', output: { where: sqlPlan.where, parameter_count: sqlPlan.values.length, returned_rows: result.rows.length, total_matches: result.pagination.total } },
          ],
          ...result,
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('AI query error:', error);
        res.status(500).json({ ok: false, message: 'AI query failed', error: error.message });
      } finally {
        client.release();
      }
    });
    
    router.get('/api/ai/history', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const sessionId = normalizeChatSessionId(req.query.session_id);
        if (!sessionId) return res.status(400).json({ ok: false, message: 'AI chat session id required' });
        const messages = await loadChatHistory(req.user.id, sessionId);
        res.json({ ok: true, session_id: sessionId, messages });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'AI history load failed', error: error.message });
      }
    });
  }
  return router;
}

module.exports = createSettingsRoutes;
