import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getApiError } from "../lib/api";
import { Loader2 } from "lucide-react";

export function Login() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, sendOtp, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    navigate("/", { replace: true });
    return null;
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError("Please enter your phone number");
      return;
    }
    setLoading(true);
    try {
      await sendOtp(phone.trim());
      setStep("otp");
      setOtp("");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!otp.trim()) {
      setError("Please enter the OTP");
      return;
    }
    setLoading(true);
    try {
      await login(phone.trim(), otp.trim());
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 sm:p-6">
      <div className="w-full max-w-sm p-6 sm:p-8 bg-white rounded-xl shadow-sm border border-zinc-200">
        <div className="text-center mb-8">
          <img
            src="/super-shyft.png"
            alt="Supershyft"
            className="mx-auto h-12 w-auto"
          />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-900 tracking-tight">
            Supershyft
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Use your phone number to continue
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {step === "phone" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                disabled={loading}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send OTP"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Verification code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                disabled={loading}
                autoFocus
              />
              <p className="mt-1 text-xs text-zinc-500">
                Code sent to {phone}
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Sign in"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              className="w-full text-sm text-zinc-500 hover:text-zinc-700"
            >
              Change phone number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
