/**
 * Simple API Key middleware for public endpoints
 * - Reads API_PUBLIC_KEY from environment
 * - Accepts either:
 *   - Header: x-api-key: <key>
 *   - Header: Authorization: ApiKey <key>
 */
export const requirePublicApiKey = (handler) => {
  return async (req, res) => {
    try {
      const configuredKey = process.env.API_PUBLIC_KEY;
      if (!configuredKey) {
        return res.status(500).json({ error: 'API public key not configured' });
      }

      const headerKey = req.headers['x-api-key'] || req.headers['x-api_key'];
      const authHeader = req.headers['authorization'] || '';

      let providedKey = null;
      if (headerKey && typeof headerKey === 'string') {
        providedKey = headerKey.trim();
      } else if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('apikey ')) {
        providedKey = authHeader.substring(7).trim();
      }

      if (!providedKey || providedKey !== configuredKey) {
        return res.status(401).json({ error: 'Unauthorized: invalid API key' });
      }

      return handler(req, res);
    } catch (err) {
      console.error('Public API key middleware error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Helper to safely serialize Patient records with BigInt fields
 */
export function serializePatient(patient) {
  if (!patient) return null;
  return {
    ...patient,
    idPatients: patient.idPatients?.toString?.() ?? patient.idPatients,
  };
}

export function serializePatients(patients) {
  return patients.map(serializePatient);
}

