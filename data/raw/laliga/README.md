# LaLiga Raw Match Data

## Overview

This directory contains raw match-level datasets for the Spanish First Division (LaLiga).

The datasets preserve the original content. Only file names have been standardized for consistency.

---

## Data Source

Provider: https://www.football-data.co.uk/
Competition code: `SP1`
Usage: Bachelor’s Thesis project

Official variable definitions and abbreviations are available at:
https://www.football-data.co.uk/notes.txt

---

## File Naming Convention

Files follow the structure:

```
laliga_YYYY_YY_raw.csv
```

The `_raw` suffix indicates original, unprocessed data.

---

## Notes

* Each row represents a single match.
* Column availability may vary between seasons.
* Data cleaning and processing are handled in the project pipeline (`src/cleaning`).
