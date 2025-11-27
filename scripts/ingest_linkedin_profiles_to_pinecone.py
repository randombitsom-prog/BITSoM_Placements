#!/usr/bin/env python3
"""
Clean LinkedIn alumni data and upsert it into the Pinecone `ipcs` index
under the `linkedin_profiles` namespace.

Requirements:
    pip install openai pinecone-client python-dotenv tqdm

Environment variables (can be placed in a .env file):
    OPENAI_API_KEY
    PINECONE_API_KEY

Usage:
    python scripts/ingest_linkedin_profiles_to_pinecone.py
"""

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Dict, Iterable, List

from dotenv import load_dotenv
from openai import OpenAI
from pinecone import Pinecone
from tqdm import tqdm

DATA_PATH = Path("sample_data/bitcom_linkedin_alumni.json")
PINECONE_INDEX = "ipcs"
NAMESPACE = "linkedin_profiles"
# Index dimension is 3072 (see Pinecone screenshot), so use the matching embedding model.
EMBED_MODEL = "text-embedding-3-large"
BATCH_SIZE = 50

MONTH_PATTERN = r"(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*"
NOISE_PATTERNS = [
    r"(?i)\b\d[\d,\.]*\s*(followers?|connections?).*",
    r"(?i)\b\d[\d,\.]*\s*(yrs?|years?|mos?|months?).*",
    r"(?i)\b(full[-\s]*time|part[-\s]*time|intern(ship)?|contract|freelance|volunteer).*",
    r"(?i)\b\d{4}\s*-\s*\d{4}.*",
    r"(?i)\b\d{4}\b.*",
]


def chunked(items: List[Dict], size: int) -> Iterable[List[Dict]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def normalize_spacing(text: str) -> str:
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    text = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", text)
    text = text.replace("·", " ").replace("•", " ").replace("|", " ")
    return re.sub(r"\s+", " ", text).strip()


def trim_repeated_phrase(text: str) -> str:
    tokens = text.split()
    max_size = min(len(tokens) // 2, 8)
    for size in range(max_size, 0, -1):
        first = tokens[:size]
        second = tokens[size : 2 * size]
        if first and first == second:
            return " ".join(first)
    return text


def clean_company_entry(entry: str) -> str:
    if not entry:
        return ""
    entry = normalize_spacing(entry)
    entry = trim_repeated_phrase(entry)
    entry = re.sub(MONTH_PATTERN, "", entry)
    for pattern in NOISE_PATTERNS:
        entry = re.sub(pattern, "", entry)
    entry = re.sub(r"[•·|]+", " ", entry)
    entry = re.sub(r"\s+", " ", entry).strip(" -·")

    tokens = []
    for token in entry.split():
        if not tokens or tokens[-1].lower() != token.lower():
            tokens.append(token)
    entry = " ".join(tokens).strip()

    if len(entry) < 2:
        return ""
    return entry


def clean_companies(companies: List[str]) -> List[str]:
    cleaned: List[str] = []
    seen = set()
    for company in companies or []:
        cleaned_entry = clean_company_entry(company)
        if cleaned_entry:
            key = cleaned_entry.lower()
            if key not in seen:
                seen.add(key)
                cleaned.append(cleaned_entry)
    return cleaned


def make_document(record: Dict, companies: List[str]) -> str:
    name = record.get("Name", "Unknown")
    url = record.get("LinkedIn URL", "N/A")
    companies_text = ", ".join(companies) if companies else "No verified past companies"
    return (
        f"{name} is a BITSoM MBA Alumni.\n"
        f"LinkedIn profile: {url}.\n"
        f"Verified past companies: {companies_text}."
    )


def load_alumni(path: Path) -> List[Dict]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("alumni", [])



def main():
    client = OpenAI(api_key=OPENAI_API_KEY)
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(PINECONE_INDEX)

    records = load_alumni(DATA_PATH)
    print(f"Loaded {len(records)} alumni records from {DATA_PATH}")

    prepared = []
    for record in records:
        companies = clean_companies(record.get("Past Companies", []))
        doc = make_document(record, companies)
        record_id = hashlib.md5(record.get("LinkedIn URL", "").encode("utf-8")).hexdigest()
        prepared.append(
            {
                "id": record_id,
                "text": doc,
                "metadata": {
                    "name": record.get("Name", "Unknown"),
                    "linkedin_url": record.get("LinkedIn URL", ""),
                    "past_companies": companies,
                    "raw_count": len(record.get("Past Companies", [])),
                },
            }
        )

    print(f"Prepared {len(prepared)} cleaned records. Upserting to Pinecone...")

    for batch in tqdm(list(chunked(prepared, BATCH_SIZE)), desc="Upserting"):
        inputs = [item["text"] for item in batch]
        response = client.embeddings.create(model=EMBED_MODEL, input=inputs)
        vectors = []
        for item, embedding in zip(batch, response.data):
            vectors.append(
                {
                    "id": item["id"],
                    "values": embedding.embedding,
                    "metadata": item["metadata"],
                }
            )
        index.upsert(vectors=vectors, namespace=NAMESPACE)

    print(f"Done. Namespace `{NAMESPACE}` now contains the cleaned LinkedIn profiles.")


if __name__ == "__main__":
    main()

