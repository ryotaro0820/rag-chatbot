from app.services.supabase_client import SupabaseRestClient as Client

BUCKET_NAME = "documents"


def upload_file(
    supabase: Client, file_bytes: bytes, storage_path: str, content_type: str
) -> str:
    """Upload a file to Supabase Storage. Returns the storage path."""
    supabase.storage.from_(BUCKET_NAME).upload(
        path=storage_path,
        file=file_bytes,
        file_options={"content-type": content_type},
    )
    return storage_path


def delete_file(supabase: Client, storage_path: str) -> None:
    """Delete a file from Supabase Storage."""
    supabase.storage.from_(BUCKET_NAME).remove([storage_path])


def get_content_type(filename: str) -> str:
    """Get MIME content type from filename."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return "application/pdf"
    elif lower.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return "application/octet-stream"
