(function () {
  "use strict";

  var csvInput = document.getElementById("csvInput");
  var fileInput = document.getElementById("fileInput");
  var dropzone = document.getElementById("dropzone");
  var cleanButton = document.getElementById("cleanButton");
  var resetButton = document.getElementById("resetButton");
  var sampleButton = document.getElementById("sampleButton");
  var exportButton = document.getElementById("exportButton");
  var reportButton = document.getElementById("reportButton");
  var resultsBody = document.getElementById("resultsBody");
  var rowsMetric = document.getElementById("rowsMetric");
  var keptMetric = document.getElementById("keptMetric");
  var duplicateMetric = document.getElementById("duplicateMetric");
  var issueMetric = document.getElementById("issueMetric");
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll(".filter-button"));

  var state = {
    result: null,
    filter: "all"
  };

  var sampleCsv = [
    "email,first_name,last_name,company,phone,website",
    " JANE.DOE@Example.com , jane ,doe, Acme Inc ,(415) 555-0192,https://www.acme.com/contact",
    "jane.doe@example.com,Jane,Doe,Acme Incorporated,4155550192,acme.com",
    "bad-email,leo,ng,Northwind,555.0199,northwind.io",
    "sam@tempmail.com,sam,rivera,Blue Harbor,+44 20 7946 0958,https://blueharbor.co",
    ",nora,lee,Plaintext Labs,,plaintextlabs.com",
    "maria@contoso.com,maria,santos,Contoso,1-212-555-0100,www.contoso.com"
  ].join("\n");

  function getOptions() {
    return {
      mergeDuplicates: document.getElementById("mergeDuplicates").checked,
      titleCaseNames: document.getElementById("titleCaseNames").checked,
      normalizePhones: document.getElementById("normalizePhones").checked,
      dropInvalidEmail: document.getElementById("dropInvalidEmail").checked
    };
  }

  function setMetrics(metrics) {
    rowsMetric.textContent = metrics.rows;
    keptMetric.textContent = metrics.kept;
    duplicateMetric.textContent = metrics.duplicates;
    issueMetric.textContent = metrics.issues;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function statusLabel(record) {
    if (record.status === "duplicate") {
      return "Duplicate";
    }
    if (record.status === "issue") {
      return "Issue";
    }
    return "Clean";
  }

  function statusClass(record) {
    if (record.status === "duplicate") {
      return "status-duplicate";
    }
    if (record.status === "issue") {
      return "status-issue";
    }
    return "status-clean";
  }

  function recordMatchesFilter(record) {
    if (state.filter === "clean") {
      return record.status === "clean";
    }
    if (state.filter === "issues") {
      return record.status === "issue";
    }
    if (state.filter === "duplicates") {
      return record.status === "duplicate";
    }
    return true;
  }

  function render() {
    if (!state.result) {
      setMetrics({ rows: 0, kept: 0, duplicates: 0, issues: 0 });
      exportButton.disabled = true;
      reportButton.disabled = true;
      resultsBody.innerHTML = "<tr class=\"empty-row\"><td colspan=\"7\">No list loaded.</td></tr>";
      return;
    }

    setMetrics(state.result.metrics);
    exportButton.disabled = state.result.exportRows.length <= 1;
    reportButton.disabled = state.result.reportRows.length <= 1;

    var rows = state.result.records.filter(recordMatchesFilter);

    if (!rows.length) {
      resultsBody.innerHTML = "<tr class=\"empty-row\"><td colspan=\"7\">No matching rows.</td></tr>";
      return;
    }

    resultsBody.innerHTML = rows.map(function (record) {
      return [
        "<tr>",
        "<td><span class=\"status-pill " + statusClass(record) + "\">" + statusLabel(record) + "</span></td>",
        "<td>" + escapeHtml(record.email) + "</td>",
        "<td>" + escapeHtml(record.name) + "</td>",
        "<td>" + escapeHtml(record.company) + "</td>",
        "<td>" + escapeHtml(record.phone) + "</td>",
        "<td>" + escapeHtml(record.website) + "</td>",
        "<td>" + escapeHtml(record.notes.join("; ") || (record.duplicateCount ? "Merged " + record.duplicateCount + " duplicate" : "")) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function clean() {
    state.result = window.LeadLint.cleanCsv(csvInput.value, getOptions());
    render();
  }

  function readFile(file) {
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      csvInput.value = String(reader.result || "");
      clean();
    };
    reader.readAsText(file);
  }

  function download(filename, content) {
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  cleanButton.addEventListener("click", clean);

  resetButton.addEventListener("click", function () {
    csvInput.value = "";
    state.result = null;
    state.filter = "all";
    filterButtons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.filter === "all");
    });
    render();
  });

  sampleButton.addEventListener("click", function () {
    csvInput.value = sampleCsv;
    clean();
  });

  exportButton.addEventListener("click", function () {
    if (!state.result) {
      return;
    }
    download("leadlint-clean.csv", window.LeadLint.serializeCsv(state.result.exportRows));
  });

  reportButton.addEventListener("click", function () {
    if (!state.result) {
      return;
    }
    download("leadlint-report.csv", window.LeadLint.serializeCsv(state.result.reportRows));
  });

  fileInput.addEventListener("change", function (event) {
    readFile(event.target.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (eventName) {
    dropzone.addEventListener(eventName, function (event) {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach(function (eventName) {
    dropzone.addEventListener(eventName, function (event) {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });

  dropzone.addEventListener("drop", function (event) {
    readFile(event.dataTransfer.files[0]);
  });

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      state.filter = button.dataset.filter;
      filterButtons.forEach(function (candidate) {
        candidate.classList.toggle("active", candidate === button);
      });
      render();
    });
  });

  Array.prototype.slice.call(document.querySelectorAll(".options-grid input")).forEach(function (input) {
    input.addEventListener("change", function () {
      if (csvInput.value.trim()) {
        clean();
      }
    });
  });

  render();
})();
