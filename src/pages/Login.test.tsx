import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Login } from "./Login";

const mockNavigate = vi.fn();
const mockSendOtp = vi.fn();
const mockResendOtp = vi.fn();
const mockLogin = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    sendOtp: mockSendOtp,
    resendOtp: mockResendOtp,
    isAuthenticated: false,
    isLoading: false,
    employeeRole: null,
    logout: vi.fn(),
    refreshProfile: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

describe("Login", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockNavigate.mockReset();
    mockSendOtp.mockReset();
    mockResendOtp.mockReset();
    mockLogin.mockReset();
    mockSendOtp.mockResolvedValue({ session_id: 1 });
    mockResendOtp.mockResolvedValue({ session_id: 2 });
    mockLogin.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function goToOtpStep(phone = "9876543210") {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: phone },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));

    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith("9876543210");
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    });
  }

  it("keeps resend unavailable during the cooldown", async () => {
    await goToOtpStep();

    expect(screen.getByText(/Resend OTP in 30s/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend OTP" })).not.toBeInTheDocument();
  });

  it("shows resend after 30 seconds and sends only the normalized phone", async () => {
    await goToOtpStep();

    vi.advanceTimersByTime(30_000);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend OTP" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend OTP" }));

    await waitFor(() => {
      expect(mockResendOtp).toHaveBeenCalledWith("9876543210");
      expect(mockResendOtp).toHaveBeenCalledTimes(1);
    });
  });

  it("clears OTP, shows success status, and restarts cooldown after resend", async () => {
    await goToOtpStep();

    const otpInput = screen.getByLabelText("Verification code");
    fireEvent.change(otpInput, { target: { value: "123456" } });
    expect(otpInput).toHaveValue("123456");

    vi.advanceTimersByTime(30_000);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend OTP" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend OTP" }));

    await waitFor(() => {
      expect(otpInput).toHaveValue("");
      expect(
        screen.getByText("A new verification code has been sent.")
      ).toBeInTheDocument();
      expect(screen.getByText(/Resend OTP in 30s/)).toBeInTheDocument();
    });
  });

  it("shows mapped error on resend failure without restarting cooldown", async () => {
    mockResendOtp.mockRejectedValue(
      new axios.AxiosError(
        "Request failed",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 404,
          data: { error_code: "USER_NOT_FOUND", message: "User does not exist" },
        } as import("axios").AxiosResponse
      )
    );

    await goToOtpStep();
    vi.advanceTimersByTime(30_000);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend OTP" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend OTP" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("User does not exist");
      expect(screen.getByRole("button", { name: "Resend OTP" })).toBeInTheDocument();
      expect(screen.queryByText(/Resend OTP in \d+s/)).not.toBeInTheDocument();
    });
  });

  it("verifies OTP and redirects after successful login", async () => {
    await goToOtpStep();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign in" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("9876543210", "123456");
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
