import asyncio
import os
import mimetypes
from typing import List, Optional
from urllib.parse import urlparse

import aiohttp

import uuid


async def download_file(url: str, save_directory: str, headers: Optional[dict] = None) -> Optional[str]:
    from utils.site_context import enabled
    from utils.public_url import validate_public_url, PublicResolver
    try:
        os.makedirs(save_directory, exist_ok=True)
        connector = aiohttp.TCPConnector(resolver=PublicResolver()) if enabled() else None
        async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=45), trust_env=False) as session:
            current = url
            for hop in range(4):
                if enabled(): validate_public_url(current)
                async with session.get(current, headers=headers, allow_redirects=False) as response:
                    if response.status in {301,302,303,307,308}:
                        from urllib.parse import urljoin
                        current = urljoin(current, response.headers.get("Location", ""))
                        headers = None  # Never forward provider credentials on a redirect.
                        continue
                    if response.status != 200: return None
                    extension = mimetypes.guess_extension(response.headers.get("Content-Type", "").split(";")[0]) or ".bin"
                    save_path = os.path.join(save_directory, str(uuid.uuid4()) + extension)
                    size = 0
                    with open(save_path, "xb") as file:
                        async for chunk in response.content.iter_chunked(8192):
                            size += len(chunk)
                            if size > 25 * 1024 * 1024: raise ValueError("Asset too large")
                            file.write(chunk)
                    return save_path
    except Exception:
        return None
    return None


async def download_files(
    urls: List[str], save_directory: str, headers: Optional[dict] = None
) -> List[Optional[str]]:
    print(f"Starting download of {len(urls)} files to {save_directory}")
    coroutines = [download_file(url, save_directory, headers) for url in urls]
    results = await asyncio.gather(*coroutines, return_exceptions=True)
    final_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"Exception during download of {urls[i]}: {result}")
            final_results.append(None)
        else:
            final_results.append(result)

    successful_downloads = sum(1 for result in final_results if result is not None)
    print(
        f"Download completed: {successful_downloads}/{len(urls)} files downloaded successfully"
    )

    return final_results
