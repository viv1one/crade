#!/usr/bin/env python3
"""Thin JSON bridge between lib/market-data/providers/jugaad-data.ts and the
jugaad-data Python library. Deliberately dumb: each command just calls the
matching jugaad-data function and prints its result as JSON on stdout — all
mapping onto Crade's Quote/HistoricalBar/Fundamentals shapes happens in
TypeScript, same as every other provider in lib/market-data/providers/.

Usage:
  jugaad_bridge.py quote <symbol>
  jugaad_bridge.py historical <symbol> <from:YYYY-MM-DD> <to:YYYY-MM-DD>

On success: JSON on stdout, exit 0.
On failure: an error message on stderr, exit 1 (nothing on stdout) — the
Node side treats any non-zero exit as "this provider failed," same as an
HTTP error from any other provider.
"""
import json
import sys
import warnings

warnings.filterwarnings("ignore")


def run_quote(symbol):
    from jugaad_data.nse import NSELive
    return NSELive().stock_quote(symbol)


def run_historical(symbol, from_str, to_str):
    from datetime import date
    from jugaad_data.nse import stock_df

    from_date = date.fromisoformat(from_str)
    to_date = date.fromisoformat(to_str)

    try:
        df = stock_df(symbol=symbol, from_date=from_date, to_date=to_date, series="EQ")
    except FileExistsError:
        # jugaad-data's on-disk cache dir is created lazily with
        # os.makedirs() (no exist_ok=True) by multiple threads in its own
        # ThreadPoolExecutor fetch pool when a date range spans more than
        # one cache-file chunk — the first-ever call on a machine can race
        # and throw here even though nothing outside this process touched
        # the directory. By the time we get here the directory exists (one
        # of the racing threads won), so a single retry clears it.
        df = stock_df(symbol=symbol, from_date=from_date, to_date=to_date, series="EQ")

    df = df.sort_values("DATE")
    return [
        {
            "date": row["DATE"].strftime("%Y-%m-%d"),
            "open": float(row["OPEN"]),
            "high": float(row["HIGH"]),
            "low": float(row["LOW"]),
            "close": float(row["CLOSE"]),
            "volume": float(row["VOLUME"]),
        }
        for _, row in df.iterrows()
    ]


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: jugaad_bridge.py <quote|historical> <symbol> [from] [to]\n")
        sys.exit(1)

    command, symbol = sys.argv[1], sys.argv[2]
    if command == "quote":
        result = run_quote(symbol)
    elif command == "historical":
        if len(sys.argv) < 5:
            sys.stderr.write("usage: jugaad_bridge.py historical <symbol> <from> <to>\n")
            sys.exit(1)
        result = run_historical(symbol, sys.argv[3], sys.argv[4])
    else:
        sys.stderr.write(f"unknown command: {command}\n")
        sys.exit(1)

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"{type(e).__name__}: {e}\n")
        sys.exit(1)
