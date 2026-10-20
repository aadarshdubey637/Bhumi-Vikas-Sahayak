import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
expect.extend(axeMatchers);
import { emptyPlotForm } from "@/api/schemas";
import type { AskResponse } from "@/api/types";
import { AnswerCard } from "@/components/ask/AnswerCard";
import { ErrorBoundary } from "@/components/common/FatalError";
import { PlotInputsForm } from "@/components/forms/PlotInputsForm";
import { askPending, EV21 } from "@/test/fixtures";
import { renderPage } from "@/test/utils";
import Channels from "./Channels";

afterEach(cleanup);

describe("Error boundary", () => {
  it("shows a friendly page instead of a blank screen, with no stack trace", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Boom(): never {
      throw new Error("secret internal detail");
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("secret internal detail");
    spy.mockRestore();
  });
});

describe("Plot inputs form", () => {
  function Harness() {
    const [form, setForm] = useState(emptyPlotForm());
    return (
      <>
        <PlotInputsForm idPrefix="t" value={form} onChange={setForm} errors={{}} />
        <output data-testid="use">{form.building_use}</output>
        <output data-testid="floors">{form.floors}</output>
      </>
    );
  }

  it("groups fields into sections and fills the building use from a chip", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("group", { name: "About the plot" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Road and location" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "The proposed building" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Residential" }));
    expect(screen.getByTestId("use")).toHaveTextContent("residential");
    expect(screen.getByRole("button", { name: "Residential" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Residential" })); // pressing again clears it
    expect(screen.getByTestId("use")).toHaveTextContent("");
  });

  it("floors stepper never goes below zero", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "One floor fewer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "One floor more" }));
    await user.click(screen.getByRole("button", { name: "One floor more" }));
    expect(screen.getByTestId("floors")).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "One floor fewer" }));
    expect(screen.getByTestId("floors")).toHaveTextContent("1");
  });

  it("every field has a visible label and a hint, and the form has no serious accessibility violations", async () => {
    const { container } = render(<Harness />);
    expect(screen.getByLabelText("Plot area", { exact: true })).toHaveAccessibleDescription(/sale deed/);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe("Answer card evidence", () => {
  const many: AskResponse = {
    ...askPending,
    evidence: [1, 2, 3, 4].map((n) => ({
      ...EV21,
      evidence_id: `EV-21-00${n}-abcdef0${n}`,
      rule_number: "21",
    })),
  };
  it("shows the best two cited passages first and the rest on request", async () => {
    const user = userEvent.setup();
    renderPage(<AnswerCard response={many} onReport={() => undefined} />);
    expect(screen.getAllByRole("article", { name: /Rule 21/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Show 2 more cited passages" }));
    expect(screen.getAllByRole("article", { name: /Rule 21/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /more cited passages/ })).toBeNull();
  });
});

describe("WhatsApp & Phone page", () => {
  it("is honest: not configured, demos are separate tabs, the setup guide shows the real webhook URL", async () => {
    const user = userEvent.setup();
    renderPage(<Channels />);
    expect(await screen.findAllByText("Not configured")).toHaveLength(2);
    expect(screen.queryByText(/Connection check passed/)).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Setup guide" }));
    expect(
      await screen.findByText("http://localhost:8000/api/v1/channels/whatsapp/webhook"),
    ).toBeInTheDocument();
    expect(screen.getByText(/treat WhatsApp and phone as untested/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Try WhatsApp" }));
    expect(screen.getAllByText(/SIMULATION/).length).toBeGreaterThan(0);
  });
});
