import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SubjectPicker from "./SubjectPicker";
import { useStore } from "@/store/useStore";

describe("SubjectPicker", () => {
  beforeEach(() => {
    useStore.setState({
      subjects: ["Geral", "Math", "Science"],
      subject: "Geral",
      setSubject: vi.fn(),
    });
  });

  it("should render the select input with subjects", () => {
    render(<SubjectPicker />);
    
    expect(screen.getByDisplayValue("Geral")).toBeDefined();
    expect(screen.getByRole("option", { name: "Math" })).toBeDefined();
  });

  it("should change subject on select", () => {
    render(<SubjectPicker />);
    
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "Math" } });
    
    const { setSubject } = useStore.getState();
    expect(setSubject).toHaveBeenCalledWith("Math");
  });
});
