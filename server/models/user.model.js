function createUserModel(pool) {
  return {
    findById(id) { return pool.query('SELECT * FROM public.app_users WHERE id = $1 LIMIT 1', [id]); },
  };
}
module.exports = { createUserModel };
