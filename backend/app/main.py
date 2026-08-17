from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.responses import FileResponse
import tempfile
import os
import subprocess

from app.services.audio_similarity import compare_audio


app = FastAPI(
    title="Dublaj API"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "message": "Dublaj API çalışıyor"
    }


# =========================================================
# CONVERT AUDIO TO WAV
# =========================================================

def convert_to_wav(
    input_path: str,
    output_path: str,
):
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            output_path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        raise RuntimeError(
            result.stderr.decode(
                errors="ignore"
            )
        )

@app.post("/scene-audio")
async def scene_audio(
    video_url: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
):
    original_wav = None

    try:
        if start_time < 0:
            raise HTTPException(
                status_code=400,
                detail="start_time negatif olamaz.",
            )

        if end_time <= start_time:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz sahne aralığı.",
            )

        duration = (
            end_time -
            start_time
        )

        original_wav = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".wav",
            ).name
        )

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",

                "-i",
                video_url,

                "-ss",
                str(start_time),

                "-t",
                str(duration),

                "-vn",

                "-ac",
                "1",

                "-ar",
                "16000",

                "-c:a",
                "pcm_s16le",

                original_wav,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if result.returncode != 0:
            error = result.stderr.decode(
                errors="ignore"
            )

            print(
                "SCENE AUDIO FFMPEG ERROR:",
                error,
            )

            raise HTTPException(
                status_code=400,
                detail=(
                    "Videonun sesi çıkarılamadı."
                ),
            )

        if not os.path.exists(
            original_wav
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ses dosyası oluşturulamadı."
                ),
            )

        file_size = os.path.getsize(
            original_wav
        )

        if file_size < 100:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Bu videoda kullanılabilir "
                    "ses bulunamadı."
                ),
            )

        with open(
            original_wav,
            "rb",
        ) as file:
            audio_bytes = file.read()

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Length":
                    str(len(audio_bytes)),
                "Cache-Control":
                    "no-store",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        print(
            "SCENE AUDIO ERROR:",
            e,
        )

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    finally:
        if (
            original_wav
            and os.path.exists(
                original_wav
            )
        ):
            try:
                os.remove(
                    original_wav
                )
            except OSError:
                pass
# =========================================================
# COMPARE TWO AUDIO FILES
# =========================================================

@app.post("/compare")
async def compare(
    original_audio: UploadFile = File(...),
    user_audio: UploadFile = File(...),
):
    original_input = None
    user_input = None

    original_wav = None
    user_wav = None

    try:
        # -------------------------------------------------
        # ORIGINAL AUDIO
        # -------------------------------------------------

        original_suffix = os.path.splitext(
            original_audio.filename or ".audio"
        )[1]

        original_temp = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=original_suffix,
            )
        )

        original_input = (
            original_temp.name
        )

        original_temp.write(
            await original_audio.read()
        )

        original_temp.close()

        # -------------------------------------------------
        # USER AUDIO
        # -------------------------------------------------

        user_suffix = os.path.splitext(
            user_audio.filename or ".audio"
        )[1]

        user_temp = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=user_suffix,
            )
        )

        user_input = user_temp.name

        user_temp.write(
            await user_audio.read()
        )

        user_temp.close()

        # -------------------------------------------------
        # WAV FILES
        # -------------------------------------------------

        original_wav = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".wav",
            ).name
        )

        user_wav = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".wav",
            ).name
        )

        # -------------------------------------------------
        # CONVERT
        # -------------------------------------------------

        convert_to_wav(
            original_input,
            original_wav,
        )

        convert_to_wav(
            user_input,
            user_wav,
        )

        # -------------------------------------------------
        # COMPARE
        # -------------------------------------------------

        score = compare_audio(
            original_wav,
            user_wav,
        )

        return {
            "score": score,
        }

    except Exception as e:
        print(
            "COMPARE ERROR:",
            e,
        )

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    finally:
        # -------------------------------------------------
        # CLEAN TEMP FILES
        # -------------------------------------------------

        for path in [
            original_input,
            user_input,
            original_wav,
            user_wav,
        ]:
            if (
                path
                and os.path.exists(path)
            ):
                try:
                    os.remove(path)
                except OSError:
                    pass


# =========================================================
# COMPARE ONE VIDEO SCENE
# =========================================================

@app.post("/compare-scene")
async def compare_scene(
    video_url: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    user_audio: UploadFile = File(...),
):
    user_input = None
    user_wav = None
    original_wav = None

    try:
        if start_time < 0:
            raise HTTPException(
                status_code=400,
                detail="start_time negatif olamaz.",
            )

        if end_time <= start_time:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz sahne aralığı.",
            )

        # -------------------------------------------------
        # USER RECORDING
        # -------------------------------------------------

        user_suffix = os.path.splitext(
            user_audio.filename or ".webm"
        )[1]

        user_temp = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=user_suffix,
        )

        user_input = user_temp.name

        audio_bytes = (
            await user_audio.read()
        )

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="Kullanıcı ses kaydı boş.",
            )

        user_temp.write(
            audio_bytes
        )

        user_temp.close()

        # -------------------------------------------------
        # USER -> WAV
        # -------------------------------------------------

        user_wav = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".wav",
        ).name

        convert_to_wav(
            user_input,
            user_wav,
        )

        if (
            not os.path.exists(user_wav)
            or os.path.getsize(user_wav)
            < 100
        ):
            raise HTTPException(
                status_code=400,
                detail="Kullanıcı ses kaydı WAV'a çevrilemedi veya boş.",
            )

        # -------------------------------------------------
        # ORIGINAL SCENE
        # -------------------------------------------------

        original_wav = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".wav",
        ).name

        duration = (
            end_time - start_time
        )

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(start_time),
                "-i",
                video_url,
                "-t",
                str(duration),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-sample_fmt",
                "s16",
                "-f",
                "wav",
                original_wav,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if result.returncode != 0:
            raise RuntimeError(
                result.stderr.decode(
                    errors="ignore"
                )
            )

        if (
            not os.path.exists(
                original_wav
            )
            or os.path.getsize(
                original_wav
            ) < 100
        ):
            raise HTTPException(
                status_code=400,
                detail="Orijinal sahnenin ses dosyası boş.",
            )

        # -------------------------------------------------
        # COMPARE
        # -------------------------------------------------

        score = compare_audio(
            original_wav,
            user_wav,
        )

        return {
            "score": score,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
        }

    except HTTPException:
        raise

    except Exception as e:
        print(
            "COMPARE SCENE ERROR:",
            e,
        )

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    finally:
        for path in [
            original_wav,
            user_input,
            user_wav,
        ]:
            if (
                path
                and os.path.exists(
                    path
                )
            ):
                try:
                    os.remove(
                        path
                    )
                except OSError:
                    pass
    user_input = None
    user_wav = None
    original_wav = None

    try:
        # -------------------------------------------------
        # VALIDATE TIME
        # -------------------------------------------------

        if start_time < 0:
            raise HTTPException(
                status_code=400,
                detail="start_time negatif olamaz.",
            )

        if end_time <= start_time:
            raise HTTPException(
                status_code=400,
                detail="Geçersiz sahne aralığı.",
            )

        # -------------------------------------------------
        # USER AUDIO
        # -------------------------------------------------

        user_suffix = os.path.splitext(
            user_audio.filename or ".webm"
        )[1]

        user_temp = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=user_suffix,
            )
        )

        user_input = user_temp.name

        user_temp.write(
            await user_audio.read()
        )

        user_temp.close()

        # -------------------------------------------------
        # USER AUDIO -> WAV
        # -------------------------------------------------

        user_wav = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".wav",
            ).name
        )

        convert_to_wav(
            user_input,
            user_wav,
        )

        # -------------------------------------------------
        # ORIGINAL SCENE AUDIO
        #
        # Video Worker URL'sinden geliyor.
        # FFmpeg sadece start_time/end_time
        # aralığını alıyor.
        # -------------------------------------------------

        original_wav = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".wav",
            ).name
        )

        ffmpeg_result = subprocess.run(
            [
                "ffmpeg",
                "-y",

                # Sahne başlangıcı
                "-ss",
                str(start_time),

                # Video URL
                "-i",
                video_url,

                # Süre
                "-t",
                str(
                    end_time -
                    start_time
                ),

                # Video istemiyoruz
                "-vn",

                # Mono
                "-ac",
                "1",

                # 16 kHz
                "-ar",
                "16000",

                # PCM
                "-sample_fmt",
                "s16",

                # Output
                original_wav,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if (
            ffmpeg_result.returncode != 0
        ):
            raise RuntimeError(
                ffmpeg_result.stderr.decode(
                    errors="ignore"
                )
            )

        # -------------------------------------------------
        # COMPARE
        # -------------------------------------------------

        score = compare_audio(
            original_wav,
            user_wav,
        )

        return {
            "score": score,
            "start_time": start_time,
            "end_time": end_time,
            "duration":
                end_time -
                start_time,
        }

    except HTTPException:
        raise

    except Exception as e:
        print(
            "COMPARE SCENE ERROR:",
            e,
        )

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    finally:
        # -------------------------------------------------
        # CLEAN TEMP FILES
        # -------------------------------------------------

        for path in [
            original_wav,
            user_input,
            user_wav,
        ]:
            if (
                path
                and os.path.exists(path)
            ):
                try:
                    os.remove(path)
                except OSError:
                    pass
@app.post("/create-final-video")
async def create_final_video(
    video_url: str = Form(...),
    final_audio: UploadFile = File(...),
):
    video_input = None
    audio_input = None
    output_file = None

    try:
        # -------------------------------------------------
        # VIDEO
        # -------------------------------------------------

        video_input = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".mp4",
        ).name

        video_response = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                video_url,
                "-c",
                "copy",
                video_input,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if (
            video_response.returncode !=
            0
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Video alınamadı."
                ),
            )

        # -------------------------------------------------
        # AUDIO
        # -------------------------------------------------

        audio_input = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".wav",
            ).name
        )

        audio_bytes = await final_audio.read()

        with open(
            audio_input,
            "wb",
        ) as file:
            file.write(
                audio_bytes
            )

        # -------------------------------------------------
        # OUTPUT
        # -------------------------------------------------

        output_file = (
            tempfile.NamedTemporaryFile(
                delete=False,
                suffix=".mp4",
            ).name
        )

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",

                "-i",
                video_input,

                "-i",
                audio_input,

                "-map",
                "0:v:0",

                "-map",
                "1:a:0",

                "-c:v",
                "copy",

                "-c:a",
                "aac",

                "-b:a",
                "192k",

                "-shortest",

                output_file,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if (
            result.returncode !=
            0
        ):
            raise HTTPException(
                status_code=400,
                detail=result.stderr.decode(
                    errors="ignore"
                ),
            )

        return FileResponse(
            output_file,
            media_type="video/mp4",
            filename="dublaj.mp4",
        )

    except HTTPException:
        raise

    except Exception as error:
        print(
            "FINAL VIDEO ERROR:",
            error,
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    finally:
        if (
            video_input
            and os.path.exists(
                video_input
            )
        ):
            os.remove(
                video_input
            )

        if (
            audio_input
            and os.path.exists(
                audio_input
            )
        ):
            os.remove(
                audio_input
            )