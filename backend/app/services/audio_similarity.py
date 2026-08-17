import numpy as np
import soundfile as sf
from scipy.signal import resample
from scipy.spatial.distance import cosine


TARGET_SAMPLE_RATE = 16000


def load_audio(file_path: str):
    audio, sample_rate = sf.read(file_path)

    # Stereo ise mono yap
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)

    audio = audio.astype(np.float64)

    # Sample rate'i 16 kHz'e getir
    if sample_rate != TARGET_SAMPLE_RATE:
        new_length = int(len(audio) * TARGET_SAMPLE_RATE / sample_rate)
        audio = resample(audio, new_length)

    return audio


def normalize_audio(audio):
    max_value = np.max(np.abs(audio))

    if max_value == 0:
        return audio

    return audio / max_value


def extract_audio_features(file_path: str):
    audio = load_audio(file_path)
    audio = normalize_audio(audio)

    # Sessizlikleri ve çok düşük seviyeli bölümleri temizle
    threshold = 0.01
    audio = audio[np.abs(audio) > threshold]

    if len(audio) == 0:
        raise ValueError("Ses dosyasında kullanılabilir ses bulunamadı.")

    # Sabit uzunluğa getir
    target_length = TARGET_SAMPLE_RATE * 5

    if len(audio) > target_length:
        audio = audio[:target_length]

    elif len(audio) < target_length:
        audio = np.pad(
            audio,
            (0, target_length - len(audio))
        )

    # Sesin frekans özelliklerini çıkar
    spectrum = np.abs(np.fft.rfft(audio))

    # Normalize
    spectrum = spectrum / (np.linalg.norm(spectrum) + 1e-10)

    return spectrum


def compare_audio(original_path: str, user_path: str):
    original_features = extract_audio_features(original_path)
    user_features = extract_audio_features(user_path)

    similarity = 1 - cosine(
        original_features,
        user_features
    )

    similarity = max(0.0, min(1.0, similarity))

    score = similarity * 100

    return round(score, 2)