import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Loader2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

type BarcodeScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
};

export function BarcodeScannerModal({ open, onClose, onScan }: BarcodeScannerModalProps) {
  const readerId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      setError(null);
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setStarting(true);
      setError(null);
      handledRef.current = false;

      const scanner = new Html5Qrcode(readerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            aspectRatio: 1.7777778,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const width = Math.floor(Math.min(viewfinderWidth * 0.92, 340));
              const height = Math.floor(Math.min(viewfinderHeight * 0.42, 140));
              return { width, height };
            },
          },
          (decodedText) => {
            if (handledRef.current) return;
            const value = decodedText.trim();
            if (!value) return;
            handledRef.current = true;
            onScan(value);
            onClose();
          },
          () => {
            // Scan attempt failed — keep trying.
          }
        );
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to access the camera. Check permissions and try again.";
          setError(message);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              // Reader may already be cleared.
            }
          });
      }
    };
  }, [open, onClose, onScan, readerId]);

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode" maxWidthClassName="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Point the camera at the tube label. Supports linear barcodes, QR codes, and Data Matrix.
        </p>

        <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
          <div id={readerId} className="min-h-[240px] w-full" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
