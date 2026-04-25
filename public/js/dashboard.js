// Dashboard logic: fetches the protected fault registry, fills metrics + table.

if (Auth.requireAuth()) {
  loadDashboard();
}

async function loadDashboard() {
  const body = document.getElementById("faults-body");
  try {
    const res = await Auth.fetch("/api/faults");
    if (!res.ok) throw new Error("Failed to load faults (" + res.status + ")");
    const data = await res.json();
    renderFaults(data.faults || []);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderFaults(faults) {
  // Metrics
  const total = faults.length;
  const open = faults.filter((f) => f.status === "OPEN").length;
  const progress = faults.filter((f) => f.status === "IN PROGRESS").length;
  const critical = faults.filter((f) => f.priority === "CRITICAL").length;

  document.getElementById("m-total").textContent = total;
  document.getElementById("m-open").textContent = open;
  document.getElementById("m-progress").textContent = progress;
  document.getElementById("m-critical").textContent = critical;

  // Table rows
  const body = document.getElementById("faults-body");
  if (!faults.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="empty-state">No faults recorded.</td></tr>';
    return;
  }

  body.innerHTML = faults
    .map((f) => {
      const priorityClass = f.priority.toLowerCase();
      const statusClass = f.status.toLowerCase().replace(/\s+/g, "-");
      return `
      <tr>
        <td>${escapeHtml(f.id)}</td>
        <td>${escapeHtml(f.title)}</td>
        <td>${escapeHtml(f.zone)}</td>
        <td>${escapeHtml(f.distance)} ${escapeHtml(f.direction)}</td>
        <td><span class="badge ${priorityClass}">${escapeHtml(f.priority)}</span></td>
        <td><span class="badge ${statusClass}">${escapeHtml(f.status)}</span></td>
        <td>${formatDate(f.reportedAt)}</td>
      </tr>
    `;
    })
    .join("");
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
