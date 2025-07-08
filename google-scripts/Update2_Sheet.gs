function doPost(e) {
  Logger.log('Received event: %s', JSON.stringify(e));
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
    Logger.log('Parsed payload: %s', JSON.stringify(payload));
  } catch (err) {
    Logger.log('JSON parse error: %s', err);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Invalid JSON payload." })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // --- reCAPTCHA verification ---
  const recaptchaResponse = payload["g-recaptcha-response"] || "";
  Logger.log('reCAPTCHA response: %s', recaptchaResponse);
  const secretKey = "6LdvmDcrAAAAAHDjWzMfpDBNlaZBJUzZxF_TZSLK"; // Replace with your actual secret key
  if (!recaptchaResponse) {
    Logger.log('Captcha response missing.');
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Captcha response missing." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
  let verification;
  try {
    const response = UrlFetchApp.fetch(verifyUrl, {
      method: "post",
      payload: {
        secret: secretKey,
        response: recaptchaResponse
      }
    });
    Logger.log('reCAPTCHA verification raw response: %s', response.getContentText());
    verification = JSON.parse(response.getContentText());
  } catch (err) {
    Logger.log('Error during reCAPTCHA verification: %s', err);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Captcha verification request failed." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  if (!verification.success) {
    Logger.log('Captcha verification failed: %s', JSON.stringify(verification));
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Captcha verification failed.", detail: verification })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  Logger.log('Captcha verification succeeded.');

  // Allow dynamic SheetID and SheetName
  const spreadsheetId = payload.spreadsheetId || payload.SheetID || "1E45f3vjLTwZ8SaL0DnzZDOaqO0OKwVDtQ-KySkM2fUs";
  const sheetName = payload.sheetName || payload.SheetName || "contact1";
  Logger.log('Spreadsheet ID: %s, Sheet Name: %s', spreadsheetId, sheetName);

  // Remove SheetID, SheetName, and g-recaptcha-response from the payload for row data
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
  Logger.log('Row data: %s', JSON.stringify(rowData));

  // Add timestamp as first column
  const timestamp = new Date();

  try {
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);

    // Write header if sheet is empty
    if (sheet.getLastRow() === 0) {
      const headers = ["timestamp", ...Object.keys(rowData)];
      sheet.appendRow(headers);
      Logger.log('Headers written: %s', JSON.stringify(headers));
    }

    // Write data row
    const row = [timestamp];
    Object.keys(rowData).forEach(key => {
      row.push(rowData[key]);
    });
    sheet.appendRow(row);
    Logger.log('Row written: %s', JSON.stringify(row));

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "Your data has been recorded." })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Sheet write error: %s', err);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Something went wrong." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}