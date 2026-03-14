from __future__ import annotations

import re
from typing import Optional, List, Set


def chunk_text(
    pages: List[dict],
    chunk_size: int = 500,
    chunk_overlap: int = 100,
) -> List[dict]:
    """Split extracted text into overlapping chunks with page tracking."""
    annotated_segments = []
    for page_info in pages:
        text = page_info["text"]
        page = page_info["page"]
        sentences = re.split(r"(?<=[。\n！？])", text)
        for sentence in sentences:
            sentence = sentence.strip()
            if sentence:
                annotated_segments.append({"text": sentence, "page": page})

    if not annotated_segments:
        return []

    chunks = []
    current_text = ""
    current_pages: Set = set()
    chunk_index = 0

    for segment in annotated_segments:
        candidate = current_text + segment["text"]

        if len(candidate) > chunk_size and current_text:
            page_nums = _format_pages(current_pages)
            chunks.append(
                {
                    "text": current_text.strip(),
                    "chunk_index": chunk_index,
                    "page_numbers": page_nums,
                }
            )
            chunk_index += 1

            if len(current_text) > chunk_overlap:
                overlap_text = current_text[-chunk_overlap:]
            else:
                overlap_text = current_text
            current_text = overlap_text + segment["text"]
            current_pages = {segment["page"]}
        else:
            current_text = candidate
            current_pages.add(segment["page"])

    if current_text.strip():
        page_nums = _format_pages(current_pages)
        chunks.append(
            {
                "text": current_text.strip(),
                "chunk_index": chunk_index,
                "page_numbers": page_nums,
            }
        )

    return chunks


def _format_pages(pages: Set) -> Optional[str]:
    """Format page numbers as a string like '1-3' or '5'."""
    nums = sorted(p for p in pages if p is not None)
    if not nums:
        return None
    if len(nums) == 1:
        return str(nums[0])
    return f"{nums[0]}-{nums[-1]}"
