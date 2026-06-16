import net from "net";
import { successResponse } from "../utils/successResponse.js";
import { errorResponse } from "../utils/errorResponse.js";

/**
 * POST /api/print/pos
 * Opens a raw TCP connection to a LAN/WiFi thermal printer and sends
 * ESC/POS bytes (base64-encoded) directly to the printer port (default 9100).
 */
async function printToNetworkPrinter(req, res, next) {
  try {
    const { ip, port = 9100, data } = req.body;

    if (!ip || typeof ip !== "string" || !ip.trim()) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Printer IP address is required",
      });
    }
    if (!data || typeof data !== "string") {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Print data (base64) is required",
      });
    }

    const printerPort = Number(port);
    if (!printerPort || printerPort < 1 || printerPort > 65535) {
      return errorResponse({
        res,
        statusCode: 400,
        message: "Invalid printer port number",
      });
    }

    const bytes = Buffer.from(data, "base64");
    const printerIp = ip.trim();

    await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const settle = (err) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(undefined);
      };

      // 5-second connection + write timeout
      const timeout = setTimeout(() => {
        settle(
          new Error(
            `Connection to printer ${printerIp}:${printerPort} timed out`
          )
        );
      }, 5000);

      socket.connect(printerPort, printerIp, () => {
        socket.write(bytes, (writeErr) => {
          clearTimeout(timeout);
          settle(writeErr ?? null);
        });
      });

      socket.on("error", (sockErr) => {
        clearTimeout(timeout);
        settle(sockErr);
      });
    });

    return successResponse({ res, message: "Print job sent to printer" });
  } catch (error) {
    return next(error);
  }
}

export { printToNetworkPrinter };
