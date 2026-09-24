/** Countries offered for market research (YouTube Data API regionCode). */
export const REGIONS: { code: string; name: string }[] = [
  { code: "", name: "Worldwide" },
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }, { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" }, { code: "IE", name: "Ireland" }, { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" }, { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" }, { code: "SE", name: "Sweden" }, { code: "CH", name: "Switzerland" },
  { code: "NG", name: "Nigeria" }, { code: "GH", name: "Ghana" }, { code: "KE", name: "Kenya" }, { code: "ZA", name: "South Africa" },
  { code: "IN", name: "India" }, { code: "PK", name: "Pakistan" }, { code: "PH", name: "Philippines" }, { code: "ID", name: "Indonesia" },
  { code: "SG", name: "Singapore" }, { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" },
  { code: "AE", name: "United Arab Emirates" }, { code: "SA", name: "Saudi Arabia" },
  { code: "BR", name: "Brazil" }, { code: "MX", name: "Mexico" },
];

export const regionName = (code: string) => REGIONS.find((r) => r.code === code)?.name ?? code;
