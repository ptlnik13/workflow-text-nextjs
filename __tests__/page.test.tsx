import { render, screen } from "@testing-library/react";

import Home from "@/app/page";

describe("Home page", () => {
  it("renders the starter heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /to get started, edit the page\.tsx file\./i,
      }),
    ).toBeInTheDocument();
  });
});

