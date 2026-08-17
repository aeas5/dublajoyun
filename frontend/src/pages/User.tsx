import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "./User.css";

const API_URL =
  "https://dublaj-worker.araslateknoloji.workers.dev";

const BACKEND_URL =
  "https://dublaj-api.onrender.com";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 180;

type Video = {
  id: number;
  title: string;
  description: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type Scene = {
  id: number;
  startTime: number;
  endTime: number;
};

type SceneRecording = {
  sceneId: number;
  blob: Blob;
  file: File;
  score: number | null;
};

/* =========================================================
   HELPERS
   ========================================================= */

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = Math.floor(
    seconds / 60
  );

  const secs = Math.floor(
    seconds % 60
  );

  return `${minutes}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/* =========================================================
   FULL WAVEFORM
   ========================================================= */

function drawWaveform(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  color: string,
  opacity = 1
) {
  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  /*
   * Center line
   */

  ctx.strokeStyle =
    "#292929";

  ctx.lineWidth = 1;

  ctx.beginPath();

  ctx.moveTo(
    0,
    height / 2
  );

  ctx.lineTo(
    width,
    height / 2
  );

  ctx.stroke();

  if (!data.length) {
    return;
  }

  /*
   * Görsel gain
   */

  const gain = 4;

  const samplesPerPixel =
    Math.max(
      1,
      Math.floor(
        data.length / width
      )
    );

  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 2;

  ctx.beginPath();

  for (
    let x = 0;
    x < width;
    x++
  ) {
    const start =
      x * samplesPerPixel;

    const end = Math.min(
      start +
        samplesPerPixel,
      data.length
    );

    let min = 1;
    let max = -1;

    for (
      let i = start;
      i < end;
      i++
    ) {
      const value =
        data[i];

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }
    }

    const amplifiedMin =
      Math.max(
        -1,
        Math.min(
          1,
          min * gain
        )
      );

    const amplifiedMax =
      Math.max(
        -1,
        Math.min(
          1,
          max * gain
        )
      );

    const top =
      height / 2 -
      amplifiedMax *
        height *
        0.45;

    const bottom =
      height / 2 -
      amplifiedMin *
        height *
        0.45;

    ctx.moveTo(
      x,
      top
    );

    ctx.lineTo(
      x,
      bottom
    );
  }

  ctx.stroke();

  ctx.globalAlpha = 1;
}

/* =========================================================
   LIVE WAVEFORM
   ========================================================= */

function drawLiveWaveform(
  canvas: HTMLCanvasElement,
  bins: Array<
    | {
        min: number;
        max: number;
      }
    | undefined
  >,
  currentPosition: number
) {
  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  /*
   * Grid
   */

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;

  for (
    let x = 0;
    x < width;
    x += 50
  ) {
    ctx.beginPath();

    ctx.moveTo(x, 0);
    ctx.lineTo(
      x,
      height
    );

    ctx.stroke();
  }

  for (
    let y = 0;
    y < height;
    y += 30
  ) {
    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      width,
      y
    );

    ctx.stroke();
  }

  /*
   * Center
   */

  ctx.strokeStyle =
    "#333";

  ctx.beginPath();

  ctx.moveTo(
    0,
    height / 2
  );

  ctx.lineTo(
    width,
    height / 2
  );

  ctx.stroke();

  /*
   * User waveform
   */

  const gain = 4;

  ctx.strokeStyle =
    "#ff453a";

  ctx.lineWidth = 2;

  ctx.beginPath();

  for (
    let x = 0;
    x < bins.length;
    x++
  ) {
    const sample =
      bins[x];

    if (!sample) {
      continue;
    }

    const min =
      Math.max(
        -1,
        Math.min(
          1,
          sample.min *
            gain
        )
      );

    const max =
      Math.max(
        -1,
        Math.min(
          1,
          sample.max *
            gain
        )
      );

    const top =
      height / 2 -
      max *
        height *
        0.45;

    const bottom =
      height / 2 -
      min *
        height *
        0.45;

    ctx.moveTo(
      x,
      top
    );

    ctx.lineTo(
      x,
      bottom
    );
  }

  ctx.stroke();

  /*
   * Playhead
   */

  if (
    currentPosition >= 0 &&
    currentPosition <=
      width
  ) {
    ctx.strokeStyle =
      "#fff";

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
      currentPosition,
      0
    );

    ctx.lineTo(
      currentPosition,
      height
    );

    ctx.stroke();
  }
}

/* =========================================================
   USER
   ========================================================= */

export default function User() {
  /*
   * =======================================================
   * VIDEOS
   * =======================================================
   */

  const [videos, setVideos] =
    useState<Video[]>([]);

  const [
    selectedVideo,
    setSelectedVideo,
  ] = useState<Video | null>(
    null
  );

  /*
   * =======================================================
   * SCENES
   * =======================================================
   */

  const [scenes, setScenes] =
    useState<Scene[]>([]);

  const [
    currentSceneIndex,
    setCurrentSceneIndex,
  ] = useState(0);

  const [
    currentTime,
    setCurrentTime,
  ] = useState(0);

  /*
   * =======================================================
   * RECORDING
   * =======================================================
   */

  const [recording, setRecording] =
    useState(false);

  const [
    recordingTime,
    setRecordingTime,
  ] = useState(0);

  const [
    sceneRecordings,
    setSceneRecordings,
  ] = useState<
    SceneRecording[]
  >([]);

  /*
   * =======================================================
   * SCORE
   * =======================================================
   */

  const [
    sceneScores,
    setSceneScores,
  ] = useState<
    Record<number, number>
  >({});

  const [
    finalScore,
    setFinalScore,
  ] = useState<number | null>(
    null
  );

  /*
   * =======================================================
   * FINAL AUDIO / VIDEO
   * =======================================================
   */

  const [
    finalAudioUrl,
    setFinalAudioUrl,
  ] = useState<
    string | null
  >(null);

  const [
    finalVideoUrl,
    setFinalVideoUrl,
  ] = useState<
    string | null
  >(null);

  /*
   * =======================================================
   * UI
   * =======================================================
   */

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  /*
   * =======================================================
   * VIDEO REFS
   * =======================================================
   */

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  const finalVideoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  const finalAudioRef =
    useRef<HTMLAudioElement | null>(
      null
    );

  /*
   * =======================================================
   * RECORDING REFS
   * =======================================================
   */

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(
      null
    );

  const streamRef =
    useRef<MediaStream | null>(
      null
    );

  const chunksRef =
    useRef<Blob[]>([]);

  const recordingStartRef =
    useRef(0);

  const timerRef =
    useRef<number | null>(
      null
    );

  /*
   * =======================================================
   * AUDIO ANALYSIS
   * =======================================================
   */

  const audioContextRef =
    useRef<AudioContext | null>(
      null
    );

  const analyserRef =
    useRef<AnalyserNode | null>(
      null
    );

  const sourceRef =
    useRef<MediaStreamAudioSourceNode | null>(
      null
    );

  const animationRef =
    useRef<number | null>(
      null
    );

  /*
   * =======================================================
   * WAVEFORM REFS
   * =======================================================
   */

  const originalCanvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const userCanvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const liveBinsRef =
    useRef<
      Array<
        | {
            min: number;
            max: number;
          }
        | undefined
      >
    >(
      Array(
        CANVAS_WIDTH
      ).fill(undefined)
    );

  const originalWaveformRef =
    useRef<Float32Array | null>(
      null
    );

  /*
   * =======================================================
   * STABLE REFS
   * =======================================================
   */

  const currentSceneRef =
    useRef<Scene | null>(
      null
    );

  const selectedVideoRef =
    useRef<Video | null>(
      null
    );

  /*
   * =======================================================
   * CURRENT SCENE
   * =======================================================
   */

  const currentScene =
    scenes[
      currentSceneIndex
    ] ?? null;

  useEffect(() => {
    currentSceneRef.current =
      currentScene;
  }, [currentScene]);

  useEffect(() => {
    selectedVideoRef.current =
      selectedVideo;
  }, [selectedVideo]);

  /*
   * =======================================================
   * LOAD VIDEOS
   * =======================================================
   */

  useEffect(() => {
    const loadVideos =
      async () => {
        try {
          const response =
            await fetch(
              `${API_URL}/api/videos`
            );

          if (!response.ok) {
            throw new Error(
              "Videolar alınamadı."
            );
          }

          const data =
            await response.json();

          setVideos(data);
        } catch (error) {
          console.error(
            error
          );

          setMessage(
            "Videolar yüklenemedi."
          );
        }
      };

    loadVideos();
  }, []);

  /*
   * =======================================================
   * CLEAR USER WAVEFORM
   * =======================================================
   */

  const clearUserWaveform =
    useCallback(() => {
      liveBinsRef.current =
        Array(
          CANVAS_WIDTH
        ).fill(undefined);

      const canvas =
        userCanvasRef.current;

      if (!canvas) {
        return;
      }

      const ctx =
        canvas.getContext(
          "2d"
        );

      if (!ctx) {
        return;
      }

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }, []);

  /*
   * =======================================================
   * LOAD ORIGINAL SCENE WAVEFORM
   * =======================================================
   */

  const loadSceneWaveform =
    useCallback(
      async (
        video: Video,
        scene: Scene
      ) => {
        try {
          const formData =
            new FormData();

          formData.append(
            "video_url",
            `${API_URL}/api/videos/file/${video.id}`
          );

          formData.append(
            "start_time",
            String(
              scene.startTime
            )
          );

          formData.append(
            "end_time",
            String(
              scene.endTime
            )
          );

          const response =
            await fetch(
              `${BACKEND_URL}/scene-audio`,
              {
                method: "POST",
                body:
                  formData,
              }
            );

          if (!response.ok) {
            const data =
              await response
                .json()
                .catch(() => null);

            throw new Error(
              data?.detail ??
                "Original scene audio alınamadı."
            );
          }

          const arrayBuffer =
            await response.arrayBuffer();

          if (
            arrayBuffer.byteLength <
            100
          ) {
            throw new Error(
              "Original scene audio boş döndü."
            );
          }

          const context =
            new AudioContext();

          const decoded =
            await context.decodeAudioData(
              arrayBuffer.slice(0)
            );

          const data =
            decoded.getChannelData(
              0
            );

          if (!data.length) {
            throw new Error(
              "Original scene audio boş."
            );
          }

          originalWaveformRef.current =
            data;

          if (
            originalCanvasRef.current
          ) {
            drawWaveform(
              originalCanvasRef.current,
              data,
              "#8b8b8b",
              1
            );
          }

          await context.close();
        } catch (error) {
          console.error(
            "Waveform error:",
            error
          );

          originalWaveformRef.current =
            null;

          if (
            originalCanvasRef.current
          ) {
            const ctx =
              originalCanvasRef.current.getContext(
                "2d"
              );

            ctx?.clearRect(
              0,
              0,
              CANVAS_WIDTH,
              CANVAS_HEIGHT
            );
          }

          setMessage(
            error instanceof Error
              ? error.message
              : "Original waveform yüklenemedi."
          );
        }
      },
      []
    );

  /*
   * =======================================================
   * SELECT VIDEO
   * =======================================================
   */

  const selectVideo =
    async (video: Video) => {
      setSelectedVideo(
        video
      );

      selectedVideoRef.current =
        video;

      setCurrentSceneIndex(
        0
      );

      setCurrentTime(0);

      setRecordingTime(
        0
      );

      setSceneRecordings(
        []
      );

      setSceneScores(
        {}
      );

      setFinalScore(
        null
      );

      if (
        finalAudioUrl
      ) {
        URL.revokeObjectURL(
          finalAudioUrl
        );
      }

      if (
        finalVideoUrl
      ) {
        URL.revokeObjectURL(
          finalVideoUrl
        );
      }

      setFinalAudioUrl(
        null
      );

      setFinalVideoUrl(
        null
      );

      setMessage("");

      try {
        const response =
          await fetch(
            `${API_URL}/api/videos/${video.id}/scenes`
          );

        if (!response.ok) {
          throw new Error(
            "Sahneler alınamadı."
          );
        }

        const data =
          await response.json();

        const loadedScenes: Scene[] =
          data.map(
            (scene: {
              scene_number: number;
              start_time: number;
              end_time: number;
            }) => ({
              id:
                Number(
                  scene.scene_number
                ),

              startTime:
                Number(
                  scene.start_time
                ),

              endTime:
                Number(
                  scene.end_time
                ),
            })
          );

        setScenes(
          loadedScenes
        );

        if (
          loadedScenes.length >
          0
        ) {
          const first =
            loadedScenes[0];

          setTimeout(
            () => {
              if (
                videoRef.current
              ) {
                videoRef.current.pause();

                videoRef.current.muted =
                  false;

                videoRef.current.currentTime =
                  first.startTime;
              }

              clearUserWaveform();

              void loadSceneWaveform(
                video,
                first
              );
            },
            100
          );
        }
      } catch (error) {
        console.error(
          "Select video error:",
          error
        );

        setMessage(
          error instanceof Error
            ? error.message
            : "Sahneler yüklenemedi."
        );
      }
    };

  /*
   * =======================================================
   * LIVE WAVEFORM
   * =======================================================
   */

  const updateLiveWaveform =
    useCallback(() => {
      const analyser =
        analyserRef.current;

      const canvas =
        userCanvasRef.current;

      const scene =
        currentSceneRef.current;

      if (
        !analyser ||
        !canvas ||
        !scene
      ) {
        return;
      }

      const data =
        new Float32Array(
          analyser.fftSize
        );

      analyser.getFloatTimeDomainData(
        data
      );

      let min = 1;
      let max = -1;

      for (
        const value of data
      ) {
        if (value < min) {
          min = value;
        }

        if (value > max) {
          max = value;
        }
      }

      const elapsed =
        (performance.now() -
          recordingStartRef.current) /
        1000;

      const sceneDuration =
        scene.endTime -
        scene.startTime;

      const progress =
        sceneDuration >
        0
          ? Math.min(
              1,
              elapsed /
                sceneDuration
            )
          : 0;

      const position =
        Math.min(
          CANVAS_WIDTH - 1,
          Math.floor(
            progress *
              CANVAS_WIDTH
          )
        );

      liveBinsRef.current[
        position
      ] = {
        min,
        max,
      };

      drawLiveWaveform(
        canvas,
        liveBinsRef.current,
        position
      );

      animationRef.current =
        requestAnimationFrame(
          updateLiveWaveform
        );
    }, []);

  /*
   * =======================================================
   * VIDEO TIME
   * =======================================================
   */

  const handleTimeUpdate =
    (
      event: React.SyntheticEvent<HTMLVideoElement>
    ) => {
      const video =
        event.currentTarget;

      const scene =
        currentSceneRef.current;

      const time =
        video.currentTime;

      setCurrentTime(
        time
      );

      if (
        !scene ||
        recording
      ) {
        return;
      }

      if (
        time >=
        scene.endTime -
          0.03
      ) {
        video.pause();

        video.currentTime =
          scene.endTime;
      }
    };

  /*
   * =======================================================
   * PLAY SCENE
   * =======================================================
   */

  const playScene =
    async () => {
      if (
        !videoRef.current ||
        !currentScene
      ) {
        return;
      }

      videoRef.current.muted =
        false;

      videoRef.current.currentTime =
        currentScene.startTime;

      try {
        await videoRef.current.play();
      } catch (error) {
        console.error(
          "Scene play error:",
          error
        );
      }
    };

  /*
   * =======================================================
   * STOP RECORDING
   * =======================================================
   */

  const stopRecording =
    useCallback(() => {
      if (
        timerRef.current !==
        null
      ) {
        window.clearInterval(
          timerRef.current
        );

        timerRef.current =
          null;
      }

      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );

        animationRef.current =
          null;
      }

      if (
        videoRef.current
      ) {
        videoRef.current.pause();

        videoRef.current.muted =
          false;

        const scene =
          currentSceneRef.current;

        if (scene) {
          videoRef.current.currentTime =
            scene.endTime;
        }
      }

      const recorder =
        mediaRecorderRef.current;

      if (
        recorder &&
        recorder.state !==
          "inactive"
      ) {
        /*
         * Son chunk'ın hazırlanmasını
         * iste.
         */
        try {
          recorder.requestData();
        } catch {
          // recorder may already be stopping
        }

        recorder.stop();
      }

      setRecording(
        false
      );
    }, []);

  /*
   * =======================================================
   * COMPARE SCENE
   * =======================================================
   */

  const compareScene =
    async (
      scene: Scene,
      file: File
    ) => {
      const video =
        selectedVideoRef.current;

      if (!video) {
        return;
      }

      try {
        setLoading(
          true
        );

        if (
          file.size ===
          0
        ) {
          throw new Error(
            "Ses kaydı boş."
          );
        }

        const formData =
          new FormData();

        formData.append(
          "video_url",
          `${API_URL}/api/videos/file/${video.id}`
        );

        formData.append(
          "start_time",
          String(
            scene.startTime
          )
        );

        formData.append(
          "end_time",
          String(
            scene.endTime
          )
        );

        formData.append(
          "user_audio",
          file
        );

        const response =
          await fetch(
            `${BACKEND_URL}/compare-scene`,
            {
              method: "POST",
              body:
                formData,
            }
          );

        const data =
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.detail ??
              "Sahne karşılaştırılamadı."
          );
        }

        setSceneScores(
          (previous) => ({
            ...previous,
            [scene.id]:
              Number(
                data.score
              ),
          })
        );
      } catch (error) {
        console.error(
          "Compare scene error:",
          error
        );

        setMessage(
          error instanceof Error
            ? error.message
            : "Sahne karşılaştırılamadı."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /*
   * =======================================================
   * START RECORDING
   * =======================================================
   */

  const startRecording =
    async () => {
      const scene =
        currentSceneRef.current;

      const video =
        videoRef.current;

      const selected =
        selectedVideoRef.current;

      if (
        !scene ||
        !video ||
        !selected ||
        recording
      ) {
        return;
      }

      try {
        setMessage("");

        clearUserWaveform();

        /*
         * Mikrofon
         */

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: {
                echoCancellation:
                  false,

                noiseSuppression:
                  false,

                autoGainControl:
                  false,
              },
            }
          );

        streamRef.current =
          stream;

        /*
         * AudioContext
         */

        const audioContext =
          new AudioContext();

        await audioContext.resume();

        audioContextRef.current =
          audioContext;

        const source =
          audioContext.createMediaStreamSource(
            stream
          );

        sourceRef.current =
          source;

        const analyser =
          audioContext.createAnalyser();

        analyser.fftSize =
          2048;

        analyser.smoothingTimeConstant =
          0;

        source.connect(
          analyser
        );

        analyserRef.current =
          analyser;

        /*
         * MediaRecorder
         */

        let recorder: MediaRecorder;

        if (
          MediaRecorder.isTypeSupported(
            "audio/webm;codecs=opus"
          )
        ) {
          recorder =
            new MediaRecorder(
              stream,
              {
                mimeType:
                  "audio/webm;codecs=opus",
              }
            );
        } else {
          recorder =
            new MediaRecorder(
              stream
            );
        }

        mediaRecorderRef.current =
          recorder;

        chunksRef.current =
          [];

        /*
         * DATA AVAILABLE
         */

        recorder.ondataavailable =
          (
            event
          ) => {
            if (
              event.data.size >
              0
            ) {
              chunksRef.current.push(
                event.data
              );
            }
          };

        /*
         * STOP
         */

        recorder.onstop =
          async () => {
            try {
              /*
               * Son chunk'ın
               * gelmesini bekle.
               */

              await new Promise<void>(
                (resolve) => {
                  setTimeout(
                    resolve,
                    100
                  );
                }
              );

              if (
                chunksRef.current
                  .length === 0
              ) {
                setMessage(
                  "Kayıt verisi oluşmadı."
                );

                return;
              }

              const mimeType =
                recorder.mimeType ||
                "audio/webm";

              const blob =
                new Blob(
                  chunksRef.current,
                  {
                    type:
                      mimeType,
                  }
                );

              console.log(
                "RECORDED MIME:",
                mimeType
              );

              console.log(
                "RECORDED SIZE:",
                blob.size
              );

              if (
                blob.size <
                1000
              ) {
                setMessage(
                  "Kayıt çok küçük veya boş."
                );

                return;
              }

              const extension =
                mimeType.includes(
                  "webm"
                )
                  ? "webm"
                  : "audio";

              const file =
                new File(
                  [blob],
                  `scene-${scene.id}.${extension}`,
                  {
                    type:
                      mimeType,
                  }
                );

              console.log(
                "FINAL RECORDING FILE:",
                file.name,
                file.type,
                file.size
              );

              /*
               * USER WAVEFORM
               */

              try {
                const buffer =
                  await blob.arrayBuffer();

                const decodeContext =
                  new AudioContext();

                const decoded =
                  await decodeContext.decodeAudioData(
                    buffer.slice(0)
                  );

                const userData =
                  decoded.getChannelData(
                    0
                  );

                if (
                  userCanvasRef.current
                ) {
                  drawWaveform(
                    userCanvasRef.current,
                    userData,
                    "#ff453a",
                    0.9
                  );
                }

                await decodeContext.close();
              } catch (
                waveformError
              ) {
                console.error(
                  "User waveform error:",
                  waveformError
                );

                /*
                 * Waveform decode başarısız olsa
                 * bile dosya kullanılmaya devam eder.
                 */
              }

              /*
               * SAVE RECORDING
               */

              setSceneRecordings(
                (previous) => {
                  const filtered =
                    previous.filter(
                      (
                        item
                      ) =>
                        item.sceneId !==
                        scene.id
                    );

                  return [
                    ...filtered,
                    {
                      sceneId:
                        scene.id,

                      blob,

                      file,

                      score:
                        null,
                    },
                  ].sort(
                    (
                      a,
                      b
                    ) =>
                      a.sceneId -
                      b.sceneId
                  );
                }
              );

              /*
               * COMPARE
               */

              await compareScene(
                scene,
                file
              );
            } finally {
              /*
               * Audio cleanup
               */

              stream
                .getTracks()
                .forEach(
                  (
                    track
                  ) =>
                    track.stop()
                );

              streamRef.current =
                null;

              mediaRecorderRef.current =
                null;

              sourceRef.current =
                null;

              analyserRef.current =
                null;

              if (
                audioContextRef.current
              ) {
                try {
                  await audioContextRef.current.close();
                } catch {
                  // already closed
                }

                audioContextRef.current =
                  null;
              }

              if (
                animationRef.current !==
                null
              ) {
                cancelAnimationFrame(
                  animationRef.current
                );

                animationRef.current =
                  null;
              }
            }
          };

        /*
         * Start recorder
         */

        recorder.start(
          100
        );

        setRecording(
          true
        );

        setRecordingTime(
          0
        );

        recordingStartRef.current =
          performance.now();

        /*
         * Video mute
         */

        video.pause();

        video.muted =
          true;

        video.currentTime =
          scene.startTime;

        await video.play();

        /*
         * Live waveform
         */

        animationRef.current =
          requestAnimationFrame(
            updateLiveWaveform
          );

        /*
         * Recording timer
         */

        const sceneDuration =
          scene.endTime -
          scene.startTime;

        timerRef.current =
          window.setInterval(
            () => {
              const elapsed =
                (performance.now() -
                  recordingStartRef.current) /
                1000;

              const safeElapsed =
                Math.min(
                  elapsed,
                  sceneDuration
                );

              setRecordingTime(
                safeElapsed
              );

              if (
                elapsed >=
                sceneDuration
              ) {
                stopRecording();
              }
            },
            50
          );
      } catch (error) {
        console.error(
          "Start recording error:",
          error
        );

        setMessage(
          error instanceof Error
            ? error.message
            : "Mikrofon erişimi sağlanamadı."
        );
      }
    };

  /*
   * =======================================================
   * CHANGE SCENE
   * =======================================================
   */

  const changeScene =
    async (
      index: number
    ) => {
      if (
        recording ||
        index < 0 ||
        index >= scenes.length
      ) {
        return;
      }

      const scene =
        scenes[index];

      setCurrentSceneIndex(
        index
      );

      setCurrentTime(
        scene.startTime
      );

      setRecordingTime(
        0
      );

      clearUserWaveform();

      if (
        videoRef.current
      ) {
        videoRef.current.pause();

        videoRef.current.muted =
          false;

        videoRef.current.currentTime =
          scene.startTime;
      }

      const selected =
        selectedVideoRef.current;

      if (selected) {
        await loadSceneWaveform(
          selected,
          scene
        );
      }
    };

  /*
   * =======================================================
   * COMBINE RECORDINGS
   * =======================================================
   */

  const combineRecordings =
    async () => {
      if (
        scenes.length ===
        0
      ) {
        return;
      }

      const recordings =
        scenes.map(
          (
            scene
          ) =>
            sceneRecordings.find(
              (
                recording
              ) =>
                recording.sceneId ===
                scene.id
            )
        );

      if (
        recordings.some(
          (
            recording
          ) => !recording
        )
      ) {
        setMessage(
          "Önce tüm sahneleri kaydetmelisin."
        );

        return;
      }

      try {
        setLoading(
          true
        );

        const sampleRate =
          48000;

        const totalDuration =
          scenes.reduce(
            (
              total,
              scene
            ) =>
              total +
              (
                scene.endTime -
                scene.startTime
              ),
            0
          );

        const offlineContext =
          new OfflineAudioContext(
            1,
            Math.ceil(
              totalDuration *
                sampleRate
            ),
            sampleRate
          );

        let offset = 0;

        for (
          let i = 0;
          i <
            scenes.length;
          i++
        ) {
          const recording =
            recordings[i];

          if (!recording) {
            continue;
          }

          const arrayBuffer =
            await recording.blob.arrayBuffer();

          const decodeContext =
            new AudioContext();

          const decoded =
            await decodeContext.decodeAudioData(
              arrayBuffer.slice(0)
            );

          await decodeContext.close();

          const source =
            offlineContext.createBufferSource();

          source.buffer =
            decoded;

          source.connect(
            offlineContext.destination
          );

          source.start(
            offset
          );

          offset +=
            scenes[i].endTime -
            scenes[i].startTime;
        }

        const rendered =
          await offlineContext.startRendering();

        const wavBlob =
          audioBufferToWav(
            rendered
          );

        /*
         * Final audio URL
         */

        if (
          finalAudioUrl
        ) {
          URL.revokeObjectURL(
            finalAudioUrl
          );
        }

        const newAudioUrl =
          URL.createObjectURL(
            wavBlob
          );

        setFinalAudioUrl(
          newAudioUrl
        );

        /*
         * Weighted score
         */

        let weightedTotal =
          0;

        let totalTime =
          0;

        scenes.forEach(
          (
            scene
          ) => {
            const score =
              sceneScores[
                scene.id
              ];

            if (
              score ===
              undefined
            ) {
              return;
            }

            const duration =
              scene.endTime -
              scene.startTime;

            weightedTotal +=
              score *
              duration;

            totalTime +=
              duration;
          }
        );

        if (
          totalTime >
          0
        ) {
          setFinalScore(
            weightedTotal /
              totalTime
          );
        }

        setMessage(
          "Tüm sahneler birleştirildi."
        );
      } catch (error) {
        console.error(
          "Combine error:",
          error
        );

        setMessage(
          error instanceof Error
            ? error.message
            : "Kayıtlar birleştirilemedi."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /*
   * =======================================================
   * AUDIO BUFFER -> WAV
   * =======================================================
   */

  const audioBufferToWav =
    (
      buffer: AudioBuffer
    ): Blob => {
      const data =
        buffer.getChannelData(
          0
        );

      const sampleRate =
        buffer.sampleRate;

      const arrayBuffer =
        new ArrayBuffer(
          44 +
            data.length *
              2
        );

      const view =
        new DataView(
          arrayBuffer
        );

      const writeString =
        (
          offset: number,
          value: string
        ) => {
          for (
            let i = 0;
            i < value.length;
            i++
          ) {
            view.setUint8(
              offset + i,
              value.charCodeAt(
                i
              )
            );
          }
        };

      writeString(
        0,
        "RIFF"
      );

      view.setUint32(
        4,
        36 +
          data.length *
            2,
        true
      );

      writeString(
        8,
        "WAVE"
      );

      writeString(
        12,
        "fmt "
      );

      view.setUint32(
        16,
        16,
        true
      );

      view.setUint16(
        20,
        1,
        true
      );

      view.setUint16(
        22,
        1,
        true
      );

      view.setUint32(
        24,
        sampleRate,
        true
      );

      view.setUint32(
        28,
        sampleRate * 2,
        true
      );

      view.setUint16(
        32,
        2,
        true
      );

      view.setUint16(
        34,
        16,
        true
      );

      writeString(
        36,
        "data"
      );

      view.setUint32(
        40,
        data.length *
          2,
        true
      );

      let offset = 44;

      for (
        let i = 0;
        i < data.length;
        i++
      ) {
        const sample =
          Math.max(
            -1,
            Math.min(
              1,
              data[i]
            )
          );

        view.setInt16(
          offset,
          sample *
            32767,
          true
        );

        offset += 2;
      }

      return new Blob(
        [arrayBuffer],
        {
          type:
            "audio/wav",
        }
      );
    };

  /*
   * =======================================================
   * FINAL VIDEO CREATION
   * =======================================================
   */

  const createFinalVideo =
    async () => {
      if (
        !selectedVideo ||
        !finalAudioUrl
      ) {
        return;
      }

      try {
        setLoading(
          true
        );

        setMessage(
          "Final video hazırlanıyor..."
        );

        /*
         * Final WAV blob
         */

        const audioResponse =
          await fetch(
            finalAudioUrl
          );

        if (
          !audioResponse.ok
        ) {
          throw new Error(
            "Final audio alınamadı."
          );
        }

        const audioBlob =
          await audioResponse.blob();

        /*
         * Multipart
         */

        const formData =
          new FormData();

        formData.append(
          "video_url",
          `${API_URL}/api/videos/file/${selectedVideo.id}`
        );

        formData.append(
          "final_audio",
          audioBlob,
          "dublaj.wav"
        );

        /*
         * Backend
         */

        const response =
          await fetch(
            `${BACKEND_URL}/create-final-video`,
            {
              method: "POST",
              body:
                formData,
            }
          );

        if (!response.ok) {
          const data =
            await response
              .json()
              .catch(() => null);

          throw new Error(
            data?.detail ??
              "Final video oluşturulamadı."
          );
        }

        const finalBlob =
          await response.blob();

        if (
          finalVideoUrl
        ) {
          URL.revokeObjectURL(
            finalVideoUrl
          );
        }

        const newVideoUrl =
          URL.createObjectURL(
            finalBlob
          );

        setFinalVideoUrl(
          newVideoUrl
        );

        setMessage(
          "Final video hazır."
        );
      } catch (error) {
        console.error(
          "Create final video error:",
          error
        );

        setMessage(
          error instanceof Error
            ? error.message
            : "Final video oluşturulamadı."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /*
   * =======================================================
   * FINAL PLAY
   * =======================================================
   */

  const playFinal =
    async () => {
      const video =
        finalVideoRef.current;

      const audio =
        finalAudioRef.current;

      if (
        !video ||
        !audio
      ) {
        return;
      }

      video.muted =
        true;

      video.currentTime =
        0;

      audio.currentTime =
        0;

      try {
        await video.play();

        await audio.play();
      } catch (error) {
        console.error(
          "Final play error:",
          error
        );
      }
    };

  /*
   * =======================================================
   * STOP FINAL
   * =======================================================
   */

  const stopFinal =
    () => {
      finalVideoRef.current?.pause();

      finalAudioRef.current?.pause();
    };

  /*
   * =======================================================
   * FINAL SYNC
   * =======================================================
   */

  const syncFinalAudio =
    () => {
      const video =
        finalVideoRef.current;

      const audio =
        finalAudioRef.current;

      if (
        !video ||
        !audio
      ) {
        return;
      }

      if (
        Math.abs(
          video.currentTime -
            audio.currentTime
        ) > 0.08
      ) {
        audio.currentTime =
          video.currentTime;
      }
    };

  /*
   * =======================================================
   * CLEANUP
   * =======================================================
   */

  useEffect(() => {
    return () => {
      if (
        timerRef.current !==
        null
      ) {
        clearInterval(
          timerRef.current
        );
      }

      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      streamRef.current
        ?.getTracks()
        .forEach(
          (
            track
          ) =>
            track.stop()
        );

      if (
        audioContextRef.current
      ) {
        void audioContextRef.current.close();
      }

      if (
        finalAudioUrl
      ) {
        URL.revokeObjectURL(
          finalAudioUrl
        );
      }

      if (
        finalVideoUrl
      ) {
        URL.revokeObjectURL(
          finalVideoUrl
        );
      }
    };
  }, [
    finalAudioUrl,
    finalVideoUrl,
  ]);

  /*
   * =======================================================
   * UI
   * =======================================================
   */

  return (
    <div className="user-page">
      <h1>Dublaj</h1>

      {/* =================================================
          VIDEO SELECT
          ================================================= */}

      {!selectedVideo && (
        <section className="user-card">
          <h2>
            Video Seç
          </h2>

          <div className="user-video-list">
            {videos.map(
              (
                video
              ) => (
                <button
                  className="video-select"
                  key={
                    video.id
                  }
                  onClick={() =>
                    selectVideo(
                      video
                    )
                  }
                >
                  <strong>
                    {
                      video.title
                    }
                  </strong>

                  <span>
                    {
                      video.description
                    }
                  </span>
                </button>
              )
            )}
          </div>
        </section>
      )}

      {/* =================================================
          CURRENT SCENE
          ================================================= */}

      {selectedVideo &&
        currentScene && (
          <section className="user-card">
            <div className="user-header">
              <div>
                <p>
                  {
                    selectedVideo.title
                  }
                </p>

                <h2>
                  Scene{" "}
                  {
                    currentScene.id
                  }
                </h2>
              </div>

              <span>
                {
                  currentSceneIndex +
                    1
                }
                {" / "}
                {
                  scenes.length
                }
              </span>
            </div>

            {/* VIDEO */}

            <div className="scene-video">
              <video
                ref={videoRef}
                src={`${API_URL}/api/videos/file/${selectedVideo.id}`}
                preload="metadata"
                onTimeUpdate={
                  handleTimeUpdate
                }
              />
            </div>

            {/* TIME */}

            <div className="scene-time">
              {
                formatTime(
                  currentTime -
                    currentScene.startTime
                )
              }

              {" / "}

              {
                formatTime(
                  currentScene.endTime -
                    currentScene.startTime
                )
              }
            </div>

            {/* WAVEFORMS */}

            <div className="waveform-label">
              Original / Senin Kaydın
            </div>

            <div className="waveform-overlay">
              <canvas
                ref={
                  originalCanvasRef
                }
                width={
                  CANVAS_WIDTH
                }
                height={
                  CANVAS_HEIGHT
                }
              />

              <canvas
                ref={
                  userCanvasRef
                }
                width={
                  CANVAS_WIDTH
                }
                height={
                  CANVAS_HEIGHT
                }
              />
            </div>

            {/* RECORDING TIME */}

            {recording && (
              <div className="recording-progress">
                ●{" "}
                {
                  formatTime(
                    recordingTime
                  )
                }

                {" / "}

                {
                  formatTime(
                    currentScene.endTime -
                      currentScene.startTime
                  )
                }
              </div>
            )}

            {/* CONTROLS */}

            <div className="user-controls">
              <button
                onClick={
                  playScene
                }
                disabled={
                  recording
                }
              >
                ▶ Sahneyi Oynat
              </button>

              {!recording ? (
                <button
                  className="record-button"
                  onClick={
                    startRecording
                  }
                >
                  🎙 Kayda Başla
                </button>
              ) : (
                <button
                  className="stop-button"
                  onClick={
                    stopRecording
                  }
                >
                  ⏹ Kaydı Durdur
                </button>
              )}
            </div>

            {/* SCORE */}

            {sceneScores[
              currentScene.id
            ] !==
              undefined && (
              <div className="scene-score">
                Scene Score:{" "}
                <strong>
                  {
                    sceneScores[
                      currentScene.id
                    ].toFixed(
                      2
                    )
                  }
                </strong>

                {" / 100"}
              </div>
            )}

            {/* NAVIGATION */}

            <div className="scene-navigation">
              <button
                onClick={() =>
                  changeScene(
                    currentSceneIndex -
                      1
                  )
                }
                disabled={
                  recording ||
                  currentSceneIndex ===
                    0
                }
              >
                ← Önceki
              </button>

              <button
                onClick={() =>
                  changeScene(
                    currentSceneIndex +
                      1
                  )
                }
                disabled={
                  recording ||
                  currentSceneIndex >=
                    scenes.length -
                      1
                }
              >
                Sonraki →
              </button>
            </div>
          </section>
        )}

      {/* =================================================
          SCENE LIST
          ================================================= */}

      {selectedVideo &&
        scenes.length >
          0 && (
          <section className="user-card">
            <div className="section-title">
              <h2>
                Sahneler
              </h2>

              <span>
                {
                  sceneRecordings.length
                }
                {" / "}
                {
                  scenes.length
                }
              </span>
            </div>

            <div className="scene-results">
              {scenes.map(
                (
                  scene
                ) => {
                  const recording =
                    sceneRecordings.find(
                      (
                        item
                      ) =>
                        item.sceneId ===
                        scene.id
                    );

                  const score =
                    sceneScores[
                      scene.id
                    ];

                  return (
                    <button
                      className={`scene-result ${
                        scene.id ===
                        currentScene?.id
                          ? "active"
                          : ""
                      }`}
                      key={
                        scene.id
                      }
                      onClick={() =>
                        changeScene(
                          scene.id -
                            1
                        )
                      }
                    >
                      <div>
                        <strong>
                          Scene{" "}
                          {
                            scene.id
                          }
                        </strong>

                        <span>
                          {
                            formatTime(
                              scene.startTime
                            )
                          }

                          {" → "}

                          {
                            formatTime(
                              scene.endTime
                            )
                          }
                        </span>
                      </div>

                      <div className="scene-result-right">
                        {recording ? (
                          <span className="recorded">
                            ✓
                          </span>
                        ) : (
                          <span>
                            —
                          </span>
                        )}

                        {score !==
                          undefined && (
                          <strong>
                            {
                              score.toFixed(
                                2
                              )
                            }
                          </strong>
                        )}
                      </div>
                    </button>
                  );
                }
              )}
            </div>

            {/* COMBINE */}

            <button
              className="combine-button"
              onClick={
                combineRecordings
              }
              disabled={
                loading ||
                recording ||
                sceneRecordings.length !==
                  scenes.length
              }
            >
              {loading
                ? "Birleştiriliyor..."
                : "Tüm Kayıtları Birleştir"}
            </button>
          </section>
        )}

      {/* =================================================
          FINAL DUBBING
          ================================================= */}

      {finalAudioUrl &&
        selectedVideo && (
          <section className="user-card final-section">
            <h2>
              Final Dublaj
            </h2>

            {/* FINAL VIDEO */}

            <div className="final-video-wrapper">
              <video
                ref={
                  finalVideoRef
                }
                src={
                  finalVideoUrl ??
                  `${API_URL}/api/videos/file/${selectedVideo.id}`
                }
                muted
                controls
                preload="metadata"
                onTimeUpdate={
                  syncFinalAudio
                }
                onPlay={() => {
                  const audio =
                    finalAudioRef.current;

                  const video =
                    finalVideoRef.current;

                  if (
                    audio &&
                    video
                  ) {
                    audio.currentTime =
                      video.currentTime;

                    void audio.play();
                  }
                }}
                onPause={() => {
                  finalAudioRef.current?.pause();
                }}
                onEnded={() => {
                  finalAudioRef.current?.pause();
                }}
              />
            </div>

            {/* FINAL AUDIO */}

            <div className="final-audio-wrapper">
              <audio
                ref={
                  finalAudioRef
                }
                src={
                  finalAudioUrl
                }
                controls
                className="final-audio"
              />
            </div>

            {/* FINAL BUTTONS */}

            <div className="final-buttons">
              <button
                onClick={
                  playFinal
                }
              >
                ▶ Final Dublajı Oynat
              </button>

              <button
                onClick={
                  stopFinal
                }
              >
                ⏹ Durdur
              </button>

              <a
                className="download-button"
                href={
                  finalAudioUrl
                }
                download={`${selectedVideo.title}-dublaj.wav`}
              >
                ⬇ Dublaj Sesini İndir
              </a>

              <button
                onClick={
                  createFinalVideo
                }
                disabled={
                  loading
                }
              >
                {loading
                  ? "Video hazırlanıyor..."
                  : "🎬 Videoyu Oluştur"}
              </button>
            </div>

            {/* GENERATED MP4 */}

            {finalVideoUrl && (
              <div className="final-download-section">
                <video
                  controls
                  src={
                    finalVideoUrl
                  }
                  className="generated-final-video"
                />

                <a
                  href={
                    finalVideoUrl
                  }
                  download={`${selectedVideo.title}-dublaj.mp4`}
                  className="download-button"
                >
                  ⬇ Videoyu İndir
                </a>
              </div>
            )}

            {/* SCORE */}

            {finalScore !== null && (
              <div className="final-score">
                <span>
                  Final Score
                </span>

                <strong>
                  {
                    finalScore.toFixed(
                      2
                    )
                  }
                </strong>

                <small>
                  / 100
                </small>
              </div>
            )}
          </section>
        )}

      {/* =================================================
          MESSAGE
          ================================================= */}

      {message && (
        <p className="user-message">
          {message}
        </p>
      )}
    </div>
  );
}