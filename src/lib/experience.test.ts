import {describe, expect, it} from "vitest";

import {countCompanies, groupByCompany} from "./experience";

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

import {
  formatDuration,
  monthsBetween,
  parseMonth,
  periodBounds,
  totalExperienceMonths
} from "./experience";

describe("parseMonth", () => {
  it("reads a 'Month YYYY' label", () => {
    expect(parseMonth("December 2025")).toEqual({year: 2025, month: 12});
  });

  it("returns null for anything else", () => {
    expect(parseMonth("Present")).toBeNull();
    expect(parseMonth("2025")).toBeNull();
  });
});

describe("periodBounds", () => {
  it("splits a closed range into start and end months", () => {
    expect(periodBounds("July 2023 – March 2025")).toEqual({
      start: {year: 2023, month: 7},
      end: {year: 2025, month: 3}
    });
  });

  it("marks an open range with a null end", () => {
    expect(periodBounds("December 2025 – Present")).toEqual({
      start: {year: 2025, month: 12},
      end: null
    });
  });

  it("returns null when the range cannot be read", () => {
    expect(periodBounds("sometime")).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("counts both the first and the last month, like LinkedIn", () => {
    expect(monthsBetween({year: 2025, month: 4}, {year: 2025, month: 12})).toBe(
      9
    );
  });

  it("spans years", () => {
    expect(monthsBetween({year: 2023, month: 7}, {year: 2025, month: 3})).toBe(
      21
    );
  });
});

describe("formatDuration", () => {
  it("shows months only under a year", () => {
    expect(formatDuration(9)).toBe("9 mos");
  });

  it("singularises one month", () => {
    expect(formatDuration(1)).toBe("1 mo");
  });

  it("shows years and months", () => {
    expect(formatDuration(21)).toBe("1 yr 9 mos");
  });

  it("drops the months when they are zero", () => {
    expect(formatDuration(24)).toBe("2 yrs");
  });
});

describe("totalExperienceMonths", () => {
  const now = {year: 2026, month: 9};

  it("unions overlapping and adjacent roles instead of summing them", () => {
    expect(
      totalExperienceMonths(
        [
          "December 2025 – Present",
          "April 2025 – December 2025",
          "July 2023 – March 2025",
          "August 2022 – June 2023",
          "December 2021 – August 2022"
        ],
        now
      )
    ).toBe(58);
  });

  it("skips gaps between roles", () => {
    expect(
      totalExperienceMonths(
        ["January 2024 – December 2024", "January 2020 – December 2020"],
        now
      )
    ).toBe(24);
  });

  it("ignores ranges it cannot read", () => {
    expect(
      totalExperienceMonths(["nonsense", "January 2024 – June 2024"], now)
    ).toBe(6);
  });
});

describe("countCompanies", () => {
  it("counts one stint per distinct company", () => {
    expect(countCompanies([{company: "MedMe"}, {company: "HyperVerge"}])).toBe(
      2
    );
  });

  it("counts a return to a former employer once", () => {
    const stints = groupByCompany([
      role("Acme", "2025 – Present", "Staff"),
      role("Other", "2023 – 2025", "Senior"),
      role("Acme", "2020 – 2023", "Junior")
    ]);
    expect(stints).toHaveLength(3);
    expect(countCompanies(stints)).toBe(2);
  });

  it("counts nothing for an empty list", () => {
    expect(countCompanies([])).toBe(0);
  });
});
