// CYB-03: Operational zones with access tiers.
// "standard" zones are visible to all authorised engineers.
// "restricted" zones require write_infastructure_data permission (senior engineer / security admin).

const ZONES = {
  "Track 1": {
    id: "ZONE-A",
    name: "Track 1",
    accessLevel: "standard",
    description: "Main passenger platform track. Signalling and platform monitoring zone.",
    hazards: "Moving trains. Platform edge. Standard PPE required.",
  },
  "Service Corridor B": {
    id: "ZONE-B",
    name: "Service Corridor B",
    accessLevel: "restricted",
    requiredPermission: "write_infastructure_data",
    description: "High-voltage traction power corridor.",
    hazards: "750V DC traction feeder. Arc flash risk. Insulation certification mandatory.",
    operationalDetail:
      "Traction feeder cabinet TF-B2 located at marker post 14. Isolation procedure: De-energise sub-station SS-4, confirm earth clip fitted before entry. Emergency contact: Traction Control Room ext 4420.",
  },
  "Tunnel Section B": {
    id: "ZONE-C",
    name: "Tunnel Section B",
    accessLevel: "restricted",
    requiredPermission: "write_infastructure_data",
    description: "Structural monitoring zone with active sensor network.",
    hazards: "Confined space. Water ingress risk. Evacuation protocol active.",
    operationalDetail:
      "Structural sensors SC-B1–SC-B6 active. Crack width threshold: 2mm triggers auto-alert. Evacuation assembly point: Surface Level Platform A. Do not enter within 30 min of scheduled service.",
  },
};

const RESTRICTED_PERMISSION = "write_infastructure_data";

module.exports = { ZONES, RESTRICTED_PERMISSION };
