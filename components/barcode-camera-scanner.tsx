"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, Square } from "lucide-react";

function cameraError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Camera access was blocked. Allow camera access, then try again.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No camera was found on this device.";
  if (error instanceof DOMException && error.name === "NotReadableError") return "The camera is already being used by another app. Close it, then try again.";
  return "The camera could not start. You can still enter the barcode manually.";
}

/** Decode standard retail barcodes from a live camera stream, including Safari
 * and installed iOS web apps where the experimental BarcodeDetector API is
 * unavailable. The decoder is dynamically imported so it is only loaded when
 * someone actually starts scanning. */
export function BarcodeCameraScanner({ onDetected, autoStart = false }: { onDetected: (barcode: string) => void; autoStart?: boolean }) {
  const [open, setOpen] = useState(autoStart);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "unsupported" | "error">("idle");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let stopScanner: (() => void) | undefined;

    const stop = () => {
      stopScanner?.();
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const begin = async () => {
      setStatus("starting");
      setMessage("");
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setStatus("unsupported");
          setMessage("Camera access requires a secure browser connection. Enter the barcode manually instead.");
          return;
        }
        const { BarcodeFormat, BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 200,
          delayBetweenScanSuccess: 500,
        });
        reader.possibleFormats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          },
          videoRef.current,
          (result, _error, callbackControls) => {
            const value = result?.getText().trim();
            if (!value || cancelled) return;
            callbackControls.stop();
            setOpen(false);
            onDetectedRef.current(value);
          },
        );
        stopScanner = controls.stop;
        if (cancelled) { stop(); return; }
        setStatus("scanning");
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(cameraError(error));
        }
        stop();
      }
    };
    void begin();
    return () => { cancelled = true; stop(); };
  }, [open]);

  const startCamera = () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage("Camera access requires a secure browser connection. Enter the barcode manually instead.");
      return;
    }
    setMessage("");
    setStatus("idle");
    setOpen(true);
  };

  return <div className="barcode-camera">
    {!open && <><button type="button" className="secondary-button barcode-camera-button" onClick={startCamera}><Camera size={17} /> Scan with camera</button>{message && <p className="barcode-camera-message" role="status">{message}</p>}</>}
    {open && <div className="barcode-camera-preview">
      {status !== "unsupported" && status !== "error" && <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview for barcode scanning" />}
      {status === "starting" && <p><LoaderCircle className="spin" size={16} /> Starting camera…</p>}
      {status === "scanning" && <p>Point the camera at the package barcode.</p>}
      {message && <p className="barcode-camera-message" role="status">{message}</p>}
      <button type="button" className="text-button" onClick={() => setOpen(false)}><Square size={15} /> Stop camera</button>
    </div>}
  </div>;
}
