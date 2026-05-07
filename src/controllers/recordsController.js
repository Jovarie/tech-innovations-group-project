// src/controllers/recordsController.js

const sampleRecords = [
  {
    id: 'REC-001',
    title: 'Inspection Log',
    zone: 'Subsystem A',
    status: 'COMPLETE',
    description: 'Routine inspection completed and logged by maintenance crew.',
    recordedAt: '2026-04-20T10:30:00Z',
  },
  {
    id: 'REC-002',
    title: 'Hardware Replacement',
    zone: 'Subsystem B',
    status: 'PENDING',
    description: 'Replacement of degraded sensor module scheduled for next shift.',
    recordedAt: '2026-04-25T14:15:00Z',
  },
];

exports.getAllRecords = (req, res) => {
  res.json({ records: sampleRecords });
};
