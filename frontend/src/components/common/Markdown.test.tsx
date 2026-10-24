import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders paragraphs, bold, bullet and numbered lists", () => {
    const { container } = render(<Markdown text={"Hello **world**\n\n- one\n- two\n\n1. first\n2. second"} />);
    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("never turns model output into HTML", () => {
    const { container } = render(<Markdown text={"<img src=x onerror=alert(1)> and <b>bold</b>"} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
