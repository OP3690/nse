"""Manual sector overrides — lowest-priority fallback.

Some listed names sit outside both NSE's Nifty-500 sector map and BSE's
ComHeader enrichment, so they show up in the screener with a blank sector.
A company's macro sector effectively never changes, so we classify those
stragglers by hand (verified from each company's public business profile) and
keep the mapping here, git-tracked, so it survives DB rebuilds.

Merged into analyze.build() with setdefault AFTER the NSE and BSE maps, i.e.
this only fills a symbol that neither exchange source covered. Every value must
be one of the existing 25 macro-sector buckets so the screener's sector facets
stay clean.

ETFs / index funds (ALPHA, BANKBETA, METAL, NEXT50, SMALLCAP, …) are
intentionally omitted — they track a basket, not a single company, so they have
no company-level sector to assign.
"""

MANUAL_SECTORS: dict[str, str] = {
    "E2E": "Information Technology",        # E2E Networks — cloud / GPU datacentres
    "ICEMAKE": "Capital Goods",             # Ice Make Refrigeration — commercial refrigeration equipment
    "KRISHANA": "Chemicals",                # Krishana Phoschem — phosphates / fertilisers
    "KRISHNADEF": "Capital Goods",          # Krishna Defence & Allied Industries — defence components
    "KSHITIJPOL": "Consumer Discretionary", # Kshitij Polyline — stationery & lamination products
    "MARINE": "Capital Goods",              # Marine Electricals (India) — electrical & marine equipment
    "MBAPL": "Chemicals",                   # Madhya Bharat Agro Products — phosphatic fertilisers
    "RELINFRA": "Power",                    # Reliance Infrastructure — power & infrastructure
    "SAKAR": "Healthcare",                  # Sakar Healthcare — pharmaceuticals
    "SERVOTECH": "Capital Goods",           # Servotech Renewable Power System — solar / EV chargers
    "SOLEX": "Capital Goods",               # Solex Energy — solar panel manufacturing
    "SVLL": "Services",                     # Shree Vasu Logistics — logistics & warehousing
    "TSFINV": "Financial Services",         # TSF Investments (ex-Sundaram Finance Holdings) — investment holding
    "ZOTA": "Healthcare",                   # Zota Health Care — pharmaceuticals
}
