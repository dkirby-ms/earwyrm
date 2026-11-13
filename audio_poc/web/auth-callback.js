"use strict";

function showCallbackError() {
  document.getElementById("status").textContent =
    "Sign-in could not be completed. Close this window and try again.";
}

if (typeof msalRedirectBridge === "undefined") {
  showCallbackError();
} else {
  msalRedirectBridge.broadcastResponseToMainFrame().catch(showCallbackError);
}
