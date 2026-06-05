function notFound(indexPath) {
  return (req, res) => res.sendFile(indexPath);
}
function errorHandler(error, req, res, next) {
  console.error('Unhandled error:', error);
  res.status(500).json({ ok: false, message: 'Server error', error: error.message });
}
module.exports = { errorHandler, notFound };
