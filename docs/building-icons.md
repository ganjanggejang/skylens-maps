# Building icons

Landmarks use a gold star. Selection is recalculated for each city, without a
list of asset names, brands, languages, or landmark name keywords.

A landmark must meet **all** of these criteria:

- Category is `Property`, with an individual Name distinct from its Zone name.
- Zoning consists only of Residential, Commercial, and/or Office.
- No existing specialized icon (hospital, school, museum, hotel, restaurant, venue, etc.).
- A nonempty Asset appears at most three times in the city.
- At least 20 properties share the same Zoning value, including mixed zoning.
- Building footprint is at least 1,000 square meters, and residents or employees number at least 700.
- Either footprint and occupancy are both in the highest 5% of that group,
  or footprint is in the highest 1% and occupancy in the highest 20%.
  Occupancy uses the higher percentile of residents and employees.

Percentiles use the midpoint rank for ties; equally sized buildings do not all
receive a top rank. Selected landmarks enter the overview label tier. Standard
map collision handling may hide icons or labels until zooming in.

This is a prominence heuristic using exported building footprints and occupancy.
Elevation is terrain elevation, not building height, and is not used. Historical
importance and distinctive architecture cannot be inferred from these fields.
Small cities or small zoning groups may have no automatically selected landmarks.
Generic zone names, industrial sites, transport facilities, parking, and extensions
are excluded. Specialized icons take precedence.
