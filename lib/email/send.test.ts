import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// send() is mocked per-instance since lib/email/send.ts constructs a new
// Resend client inside sendEmailNotification (lazily — see that file's
// comment on why: the real SDK throws immediately on an empty API key at
// construction time, which once broke `next build`'s page-data collection).
const mockSend = vi.fn();
vi.mock("resend", () => ({
  // Must be a real function (not an arrow function) so `new Resend(...)` in
  // lib/email/send.ts works — arrow functions can't be used as constructors.
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: mockSend } };
  }),
}));

describe("sendEmailNotification", () => {
  beforeEach(() => {
    mockSend.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends with the sandbox sender by default and no trailing URL", async () => {
    // vitest doesn't load .env files, so RESEND_FROM_EMAIL is genuinely
    // unset here — deliberately not stubbed, to exercise the real default.
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockSend.mockResolvedValue({ data: { id: "1" }, error: null });

    const { sendEmailNotification } = await import("./send");
    await sendEmailNotification("user@example.com", { title: "RELIANCE.NS alert triggered", body: "Price above ₹1300" });

    expect(mockSend).toHaveBeenCalledWith({
      from: "Crade <onboarding@resend.dev>",
      to: "user@example.com",
      subject: "RELIANCE.NS alert triggered",
      text: "Price above ₹1300",
    });
  });

  it("appends the url to the body when given", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockSend.mockResolvedValue({ data: { id: "1" }, error: null });

    const { sendEmailNotification } = await import("./send");
    await sendEmailNotification("user@example.com", {
      title: "RELIANCE.NS alert triggered",
      body: "Price above ₹1300",
      url: "https://example.com",
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Price above ₹1300\n\nhttps://example.com" })
    );
  });

  it("respects a custom RESEND_FROM_EMAIL", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Crade <alerts@example.com>");
    mockSend.mockResolvedValue({ data: { id: "1" }, error: null });

    const { sendEmailNotification } = await import("./send");
    await sendEmailNotification("user@example.com", { title: "t", body: "b" });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ from: "Crade <alerts@example.com>" }));
  });

  it("throws when Resend returns an error, so the caller's catch can isolate the failure", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const error = { name: "validation_error", message: "Invalid `to` field" };
    mockSend.mockResolvedValue({ data: null, error });

    const { sendEmailNotification } = await import("./send");
    await expect(sendEmailNotification("not-an-email", { title: "t", body: "b" })).rejects.toEqual(error);
  });
});
