(function (root) {
  "use strict";

  var disposableDomains = {
    "10minutemail.com": true,
    "guerrillamail.com": true,
    "mailinator.com": true,
    "tempmail.com": true,
    "temp-mail.org": true,
    "yopmail.com": true
  };

  var fieldAliases = {
    email: ["email", "e-mail", "mail", "work email", "business email"],
    firstName: ["first", "first name", "firstname", "given name"],
    lastName: ["last", "last name", "lastname", "surname", "family name"],
    fullName: ["name", "full name", "contact", "contact name"],
    company: ["company", "account", "organization", "organisation", "business"],
    phone: ["phone", "mobile", "cell", "telephone", "phone number"],
    website: ["website", "site", "url", "domain", "company website"]
  };

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    var i = 0;

    text = String(text || "").replace(/^\uFEFF/, "");

    while (i < text.length) {
      var char = text[i];
      var next = text[i + 1];

      if (inQuotes) {
        if (char === "\"" && next === "\"") {
          cell += "\"";
          i += 2;
          continue;
        }
        if (char === "\"") {
          inQuotes = false;
          i += 1;
          continue;
        }
        cell += char;
        i += 1;
        continue;
      }

      if (char === "\"") {
        inQuotes = true;
        i += 1;
        continue;
      }

      if (char === ",") {
        row.push(cell);
        cell = "";
        i += 1;
        continue;
      }

      if (char === "\n" || char === "\r") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        if (char === "\r" && next === "\n") {
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      cell += char;
      i += 1;
    }

    row.push(cell);
    rows.push(row);

    return rows.filter(function (candidate, index) {
      if (index === rows.length - 1 && candidate.length === 1 && candidate[0] === "") {
        return false;
      }
      return candidate.some(function (value) {
        return String(value).trim() !== "";
      });
    });
  }

  function serializeCsv(rows) {
    return rows.map(function (row) {
      return row.map(function (value) {
        var text = value == null ? "" : String(value);
        if (/[",\r\n]/.test(text)) {
          return "\"" + text.replace(/"/g, "\"\"") + "\"";
        }
        return text;
      }).join(",");
    }).join("\r\n");
  }

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function detectColumns(headers) {
    var normalized = headers.map(normalizeHeader);
    var detected = {};

    Object.keys(fieldAliases).forEach(function (field) {
      var aliases = fieldAliases[field];
      var index = -1;

      aliases.some(function (alias) {
        index = normalized.indexOf(alias);
        return index !== -1;
      });

      if (index !== -1) {
        detected[field] = index;
      }
    });

    return detected;
  }

  function titleCase(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\b([a-z])/g, function (match) {
        return match.toUpperCase();
      })
      .replace(/\b(Mc)([a-z])/g, function (_, prefix, letter) {
        return prefix + letter.toUpperCase();
      });
  }

  function cleanEmail(value) {
    var email = String(value || "").trim().toLowerCase();
    var match = email.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i);
    return match ? match[0].toLowerCase() : email;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
  }

  function getEmailDomain(email) {
    var parts = String(email || "").toLowerCase().split("@");
    return parts.length === 2 ? parts[1] : "";
  }

  function normalizePhone(value) {
    var raw = String(value || "").trim();
    var hasPlus = raw[0] === "+";
    var digits = raw.replace(/\D/g, "");

    if (!digits) {
      return "";
    }

    if (digits.length === 10) {
      return "+1 " + digits.slice(0, 3) + " " + digits.slice(3, 6) + " " + digits.slice(6);
    }

    if (digits.length === 11 && digits[0] === "1") {
      return "+1 " + digits.slice(1, 4) + " " + digits.slice(4, 7) + " " + digits.slice(7);
    }

    return (hasPlus ? "+" : "") + digits;
  }

  function normalizeWebsite(value) {
    var text = String(value || "").trim().toLowerCase();
    if (!text) {
      return "";
    }

    text = text.replace(/^https?:\/\//, "").replace(/^www\./, "");
    text = text.split("/")[0].split("?")[0].split("#")[0];
    return text;
  }

  function compactSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function get(row, index) {
    return typeof index === "number" ? row[index] || "" : "";
  }

  function set(row, index, value) {
    if (typeof index === "number") {
      row[index] = value;
    }
  }

  function buildFullName(row, detected) {
    if (typeof detected.fullName === "number") {
      return compactSpaces(get(row, detected.fullName));
    }
    return compactSpaces([get(row, detected.firstName), get(row, detected.lastName)].filter(Boolean).join(" "));
  }

  function qualityKey(record) {
    if (record.email && isValidEmail(record.email)) {
      return "email:" + record.email;
    }
    if (record.phone) {
      return "phone:" + record.phone.replace(/\D/g, "");
    }
    if (record.website && record.name) {
      return "site-name:" + record.website + ":" + record.name.toLowerCase();
    }
    return "";
  }

  function mergeRows(target, source) {
    source.values.forEach(function (value, index) {
      if (!target.values[index] && value) {
        target.values[index] = value;
      }
    });
    target.duplicateCount += 1;
    target.notes.push("Merged duplicate row " + source.sourceRow);
  }

  function cleanCsv(text, options) {
    options = Object.assign({
      mergeDuplicates: true,
      titleCaseNames: true,
      normalizePhones: true,
      dropInvalidEmail: false
    }, options || {});

    var rows = parseCsv(text);

    if (!rows.length) {
      return {
        headers: [],
        records: [],
        exportRows: [],
        metrics: { rows: 0, kept: 0, duplicates: 0, issues: 0 }
      };
    }

    var headers = rows[0].map(compactSpaces);
    var detected = detectColumns(headers);
    var seen = {};
    var duplicateRecords = [];
    var cleanRecords = [];
    var issues = 0;

    rows.slice(1).forEach(function (rawRow, rowIndex) {
      var values = headers.map(function (_, index) {
        return compactSpaces(rawRow[index]);
      });
      var notes = [];

      var email = cleanEmail(get(values, detected.email));
      var emailDomain = getEmailDomain(email);
      set(values, detected.email, email);

      if (typeof detected.firstName === "number" && options.titleCaseNames) {
        set(values, detected.firstName, titleCase(get(values, detected.firstName)));
      }
      if (typeof detected.lastName === "number" && options.titleCaseNames) {
        set(values, detected.lastName, titleCase(get(values, detected.lastName)));
      }
      if (typeof detected.fullName === "number" && options.titleCaseNames) {
        set(values, detected.fullName, titleCase(get(values, detected.fullName)));
      }
      if (typeof detected.company === "number") {
        set(values, detected.company, compactSpaces(get(values, detected.company)));
      }
      if (typeof detected.phone === "number" && options.normalizePhones) {
        set(values, detected.phone, normalizePhone(get(values, detected.phone)));
      }
      if (typeof detected.website === "number") {
        set(values, detected.website, normalizeWebsite(get(values, detected.website)));
      }

      if (email && !isValidEmail(email)) {
        notes.push("Invalid email");
      }
      if (!email) {
        notes.push("Missing email");
      }
      if (emailDomain && disposableDomains[emailDomain]) {
        notes.push("Disposable email");
      }

      var record = {
        sourceRow: rowIndex + 2,
        values: values,
        email: email,
        name: buildFullName(values, detected),
        company: get(values, detected.company),
        phone: get(values, detected.phone),
        website: get(values, detected.website),
        notes: notes,
        status: notes.length ? "issue" : "clean",
        duplicateCount: 0,
        duplicateOf: ""
      };

      if (options.dropInvalidEmail && email && !isValidEmail(email)) {
        record.status = "issue";
        record.hidden = true;
      }

      var key = qualityKey(record);

      if (key && seen[key]) {
        record.status = "duplicate";
        record.duplicateOf = seen[key].sourceRow;
        record.notes.push("Duplicate of row " + seen[key].sourceRow);
        duplicateRecords.push(record);
        if (options.mergeDuplicates) {
          mergeRows(seen[key], record);
          return;
        }
      } else if (key) {
        seen[key] = record;
      }

      if (record.notes.length) {
        issues += 1;
      }

      cleanRecords.push(record);
    });

    var records = cleanRecords.concat(duplicateRecords);
    var visibleRecords = cleanRecords.filter(function (record) {
      return !record.hidden;
    });
    var exportRows = [headers].concat(visibleRecords.map(function (record) {
      return record.values;
    }));
    var reportRows = [
      ["source_row", "status", "email", "name", "company", "phone", "website", "notes"]
    ].concat(records.filter(function (record) {
      return record.status !== "clean" || record.duplicateCount > 0;
    }).map(function (record) {
      return [
        record.sourceRow,
        record.status,
        record.email,
        record.name,
        record.company,
        record.phone,
        record.website,
        record.notes.join("; ") || (record.duplicateCount ? "Merged " + record.duplicateCount + " duplicate" : "")
      ];
    }));

    return {
      headers: headers,
      detected: detected,
      records: records,
      exportRows: exportRows,
      reportRows: reportRows,
      metrics: {
        rows: rows.length - 1,
        kept: visibleRecords.length,
        duplicates: duplicateRecords.length,
        issues: issues
      }
    };
  }

  var LeadLint = {
    parseCsv: parseCsv,
    serializeCsv: serializeCsv,
    cleanCsv: cleanCsv,
    detectColumns: detectColumns,
    normalizePhone: normalizePhone,
    normalizeWebsite: normalizeWebsite,
    titleCase: titleCase,
    isValidEmail: isValidEmail
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = LeadLint;
  }

  root.LeadLint = LeadLint;
})(typeof window !== "undefined" ? window : globalThis);
