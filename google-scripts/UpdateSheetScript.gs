function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Invalid JSON payload." })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // --- reCAPTCHA verification ---
  const recaptchaResponse = payload["g-recaptcha-response"] || "";
  const secretKey = "6LdvmDcrAAAAAHDjWzMfpDBNlaZBJUzZxF_TZSLK"; // Replace with your actual secret key
  if (!recaptchaResponse) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Captcha response missing." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
  const response = UrlFetchApp.fetch(verifyUrl, {
    method: "post",
    payload: {
      secret: secretKey,
      response: recaptchaResponse
    }
  });
  const verification = JSON.parse(response.getContentText());
  if (!verification.success) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Captcha verification failed." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  // --- end reCAPTCHA verification ---

  // Allow dynamic SheetID and SheetName
  const spreadsheetId = payload.spreadsheetId || payload.SheetID || "1E45f3vjLTwZ8SaL0DnzZDOaqO0OKwVDtQ-KySkM2fUs";
  const sheetName = payload.sheetName || payload.SheetName || "contact1";

  // Remove SheetID and SheetName from the payload for row data
  const rowData = {};
  for (const key in payload) {
    if (
      key !== "spreadsheetId" &&
      key !== "sheetName" &&
      key !== "SheetID" &&
      key !== "SheetName" &&
      key !== "g-recaptcha-response"
    ) {
      rowData[key] = payload[key];
    }
  }

  // Add timestamp as first column
  const timestamp = new Date();

  try {
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);

    // Write header if sheet is empty
    if (sheet.getLastRow() === 0) {
      const headers = ["timestamp", ...Object.keys(rowData)];
      sheet.appendRow(headers);
    }

    // Write data row
    const row = [timestamp];
    Object.keys(rowData).forEach(key => {
      row.push(rowData[key]);
    });
    sheet.appendRow(row);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "Your data has been recorded." })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Something went wrong." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}