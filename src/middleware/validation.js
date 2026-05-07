// src/middleware/validation.js
function validateLoginInput(req, res, next) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  next();
}

module.exports = { validateLoginInput };