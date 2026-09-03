import {describe, expect, it} from "vitest";

import {groupByCompany} from "./experience";

// Minimal shape: the helper is generic over anything carrying company, date
// and location, so the component can pass the full WorkExperience objects.
const role = (
  company: string,
  date: string,
  role: string,
  location = "Bangalore"
) => ({company, date, role, location});

describe("groupByCompany", () => {
  it("keeps one entry per role when companies differ", () => {
    const groups = groupByCompany([
      role("MedMe", "December 2025 – Present", "SE II", "Canada"),
      role("Samsung", "December 2021 – August 2022", "Intern")
    ]);
    expect(groups.map(g => g.company)).toEqual(["MedMe", "Samsung"]);
    expect(groups.map(g => g.roles.length)).toEqual([1, 1]);
  });

  it("folds consecutive roles at the same company into one stint", () => {
    const groups = groupByCompany([
      role("HyperVerge", "April 2025 – December 2025", "SDE 2"),
      role("HyperVerge", "July 2023 – March 2025", "SDE 1"),
      role("HyperVerge", "August 2022 – June 2023", "Intern")
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].roles.map(r => r.role)).toEqual([
      "SDE 2",
      "SDE 1",
      "Intern"
    ]);
  });

  it("spans a stint from the oldest start to the newest end", () => {
    const [stint] = groupByCompany([
      role("HyperVerge", "April 2025 – December 2025", "SDE 2"),
      role("HyperVerge", "August 2022 – June 2023", "Intern")
    ]);
    expect(stint.span).toBe("August 2022 – December 2025");
  });

  it("keeps a single role's own date string as the span", () => {
    const [stint] = groupByCompany([
      role("MedMe", "December 2025 – Present", "SE II")
    ]);
    expect(stint.span).toBe("December 2025 – Present");
  });

  it("splits a return to a former company into separate stints", () => {
    const groups = groupByCompany([
      role("Acme", "2025 – Present", "Staff"),
      role("Other", "2023 – 2025", "Senior"),
      role("Acme", "2020 – 2023", "Junior")
    ]);
    expect(groups.map(g => g.company)).toEqual(["Acme", "Other", "Acme"]);
  });

  it("lifts the location to the stint when every role shares it", () => {
    const [stint] = groupByCompany([
      role("HyperVerge", "April 2025 – December 2025", "SDE 2"),
      role("HyperVerge", "August 2022 – June 2023", "Intern")
    ]);
    expect(stint.location).toBe("Bangalore");
  });

  it("leaves the stint location empty when roles were in different places", () => {
    const [stint] = groupByCompany([
      role("HyperVerge", "April 2025 – December 2025", "SDE 2", "Toronto"),
      role("HyperVerge", "August 2022 – June 2023", "Intern", "Bangalore")
    ]);
    expect(stint.location).toBeNull();
  });
});
