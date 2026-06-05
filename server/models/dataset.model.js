function createDatasetModel(pool) {
  return {
    findRowById(datasetId, id) { return pool.query('SELECT id::text, row_number, data FROM public.dataset_rows WHERE dataset_id = $1 AND id::text = $2 LIMIT 1', [datasetId, String(id)]); },
  };
}
module.exports = { createDatasetModel };
