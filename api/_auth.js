// Shared access check for the /api functions. The owner sets a private
// password in the Vercel env var ABDULLAH_ACCESS_KEY; the app sends it in the
// X-Access-Key header on every request. Files starting with "_" are not
// deployed as routes by Vercel.
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

// Returns true when the request may continue; otherwise sends the error
// response itself and returns false.
module.exports = function checkAccess(req, res) {
  const expected = process.env.ABDULLAH_ACCESS_KEY;
  if (!expected) {
    res.status(500).json({ error: 'Server is missing ABDULLAH_ACCESS_KEY' });
    return false;
  }
  const given = req.headers['x-access-key'] || '';
  // Compare fixed-length hashes so timingSafeEqual never throws on length.
  if (!crypto.timingSafeEqual(sha256(given), sha256(expected))) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
};
