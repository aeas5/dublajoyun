from audio_similarity import compare_audio


score = compare_audio(
    "original.wav",
    "user.wav"
)

print(f"Similarity: {score}/100")