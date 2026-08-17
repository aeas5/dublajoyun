import {
  useEffect,
  useRef,
  useState,
} from "react";

import "./Admin.css";

const API_URL =
  "https://dublaj-worker.araslateknoloji.workers.dev";

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

type SceneCut = {
  id: number;
  time: number;
};

type Scene = {
  id: number;
  startTime: number;
  endTime: number;
};

export default function Admin() {
  /*
   * =====================================================
   * VIDEO UPLOAD
   * =====================================================
   */

  const [title, setTitle] =
    useState("");

  const [uploadOpen, setUploadOpen] =
    useState(false);

  const [description, setDescription] =
    useState("");

  const [file, setFile] =
    useState<File | null>(null);

  const [videos, setVideos] =
    useState<Video[]>([]);

  const [uploading, setUploading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  /*
   * =====================================================
   * SCENE EDITOR
   * =====================================================
   */

  const [
    selectedVideoId,
    setSelectedVideoId,
  ] = useState<number | null>(
    null
  );

  const [
    currentTime,
    setCurrentTime,
  ] = useState(0);

  const [duration, setDuration] =
    useState(0);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [sceneCuts, setSceneCuts] =
    useState<SceneCut[]>([]);

  const [scenes, setScenes] =
    useState<Scene[]>([]);

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  /*
   * =====================================================
   * LOAD VIDEOS
   * =====================================================
   */

  const loadVideos = async () => {
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
        "loadVideos error:",
        error
      );

      setMessage(
        "Videolar yüklenemedi."
      );
    }
  };

  useEffect(() => {
    loadVideos();
  }, []);

  /*
   * =====================================================
   * UPLOAD VIDEO
   * =====================================================
   */

  const uploadVideo = async () => {
    if (!title.trim()) {
      setMessage(
        "Video başlığı gir."
      );
      return;
    }

    if (!file) {
      setMessage(
        "Video seç."
      );
      return;
    }

    const MAX_SIZE =
      100 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      setMessage(
        "Şimdilik maksimum video boyutu 100 MB."
      );
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const response =
        await fetch(
          `${API_URL}/api/videos/upload`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                file.type ||
                "application/octet-stream",

              "X-Video-Title":
                encodeURIComponent(
                  title
                ),

              "X-Video-Description":
                encodeURIComponent(
                  description
                ),

              "X-Original-Filename":
                encodeURIComponent(
                  file.name
                ),
            },

            body: file,
          }
        );

      if (!response.ok) {
        let errorMessage =
          "Upload başarısız.";

        try {
          const data =
            await response.json();

          if (data.error) {
            errorMessage =
              data.error;
          }
        } catch {
          // JSON yoksa
        }

        throw new Error(
          errorMessage
        );
      }

      setTitle("");
      setDescription("");
      setFile(null);

      const input =
        document.querySelector(
          "#video-file"
        ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      setMessage(
        "Video başarıyla yüklendi."
      );

      await loadVideos();

      /*
       * Upload tamamlandıktan sonra
       * paneli kapat.
       */
      setUploadOpen(false);
    } catch (error) {
      console.error(
        "uploadVideo error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Upload başarısız."
      );
    } finally {
      setUploading(false);
    }
  };

  /*
   * =====================================================
   * DELETE VIDEO
   * =====================================================
   */

  const deleteVideo = async (
    id: number
  ) => {
    const confirmed =
      window.confirm(
        "Bu videoyu silmek istediğine emin misin?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/api/videos/${id}`,
          {
            method: "DELETE",
          }
        );

      if (!response.ok) {
        let errorMessage =
          "Video silinemedi.";

        try {
          const data =
            await response.json();

          if (data.error) {
            errorMessage =
              data.error;
          }
        } catch {
          // JSON yoksa
        }

        throw new Error(
          errorMessage
        );
      }

      if (
        selectedVideoId === id
      ) {
        setSelectedVideoId(null);
        setSceneCuts([]);
        setScenes([]);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
      }

      await loadVideos();

      setMessage(
        "Video silindi."
      );
    } catch (error) {
      console.error(
        "deleteVideo error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Video silinemedi."
      );
    }
  };

  /*
   * =====================================================
   * BUILD SCENES FROM CUTS
   * =====================================================
   */

  const buildScenesFromCuts = (
    cuts: SceneCut[],
    videoDuration: number
  ): Scene[] => {
    if (
      !Number.isFinite(
        videoDuration
      ) ||
      videoDuration <= 0
    ) {
      return [];
    }

    const sortedCuts =
      [...cuts]
        .filter(
          (cut) =>
            Number.isFinite(
              cut.time
            ) &&
            cut.time > 0 &&
            cut.time <
              videoDuration
        )
        .sort(
          (a, b) =>
            a.time - b.time
        );

    const points = [
      0,
      ...sortedCuts.map(
        (cut) => cut.time
      ),
      videoDuration,
    ];

    const generatedScenes: Scene[] =
      [];

    for (
      let i = 0;
      i <
      points.length - 1;
      i++
    ) {
      const start =
        points[i];

      const end =
        points[i + 1];

      if (
        end <= start
      ) {
        continue;
      }

      generatedScenes.push({
        id:
          generatedScenes.length +
          1,
        startTime: start,
        endTime: end,
      });
    }

    return generatedScenes;
  };

  /*
   * =====================================================
   * SELECT VIDEO
   * =====================================================
   */

  const selectVideo = async (
    video: Video
  ) => {
    setSelectedVideoId(
      video.id
    );

    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setSceneCuts([]);
    setScenes([]);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime =
        0;
    }

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

      /*
       * Son sahne hariç bütün endTime'lar
       * kesim noktasıdır.
       */
      const loadedCuts: SceneCut[] =
        [];

      loadedScenes.forEach(
        (
          scene,
          index
        ) => {
          if (
            index <
            loadedScenes.length -
              1
          ) {
            loadedCuts.push({
              id:
                loadedCuts.length +
                1,

              time:
                scene.endTime,
            });
          }
        }
      );

      setSceneCuts(
        loadedCuts
      );
    } catch (error) {
      console.error(
        "selectVideo error:",
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
   * =====================================================
   * PLAY / PAUSE
   * =====================================================
   */

  const togglePlay = async () => {
    if (!videoRef.current) {
      return;
    }

    try {
      if (
        videoRef.current.paused
      ) {
        await videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    } catch (error) {
      console.error(
        "Play error:",
        error
      );
    }
  };

  /*
   * =====================================================
   * ADD CUT
   * =====================================================
   */

  const addSceneCut = () => {
    if (!videoRef.current) {
      return;
    }

    const time =
      videoRef.current.currentTime;

    const videoDuration =
      videoRef.current.duration;

    if (
      !Number.isFinite(
        time
      ) ||
      !Number.isFinite(
        videoDuration
      )
    ) {
      return;
    }

    if (
      time <= 0.01 ||
      time >=
        videoDuration - 0.01
    ) {
      setMessage(
        "Videonun başı veya sonu için kesim noktası eklemene gerek yok."
      );

      return;
    }

    const alreadyExists =
      sceneCuts.some(
        (cut) =>
          Math.abs(
            cut.time - time
          ) < 0.05
      );

    if (alreadyExists) {
      setMessage(
        "Bu noktada zaten bir kesim var."
      );

      return;
    }

    const updatedCuts =
      [
        ...sceneCuts,
        {
          id:
            sceneCuts.length +
            1,
          time,
        },
      ].sort(
        (a, b) =>
          a.time - b.time
      );

    const normalizedCuts =
      updatedCuts.map(
        (cut, index) => ({
          ...cut,
          id: index + 1,
        })
      );

    setSceneCuts(
      normalizedCuts
    );

    const generatedScenes =
      buildScenesFromCuts(
        normalizedCuts,
        videoDuration
      );

    setScenes(
      generatedScenes
    );

    videoRef.current.pause();

    setIsPlaying(false);

    setMessage(
      `${time.toFixed(
        2
      )} saniyesine kesim noktası eklendi.`
    );
  };

  /*
   * =====================================================
   * REMOVE CUT
   * =====================================================
   */

  const removeSceneCut = (
    cutId: number
  ) => {
    const updatedCuts =
      sceneCuts
        .filter(
          (cut) =>
            cut.id !== cutId
        )
        .sort(
          (a, b) =>
            a.time - b.time
        )
        .map(
          (cut, index) => ({
            ...cut,
            id: index + 1,
          })
        );

    setSceneCuts(
      updatedCuts
    );

    const generatedScenes =
      buildScenesFromCuts(
        updatedCuts,
        duration
      );

    setScenes(
      generatedScenes
    );
  };

  /*
   * =====================================================
   * SAVE SCENES
   * =====================================================
   */

  const saveScenes = async (
    videoId: number,
    sceneData: Scene[]
  ) => {
    const completeScenes =
      sceneData.filter(
        (scene) =>
          Number.isFinite(
            scene.startTime
          ) &&
          Number.isFinite(
            scene.endTime
          ) &&
          scene.endTime >
            scene.startTime
      );

    if (
      completeScenes.length ===
      0
    ) {
      setMessage(
        "Kaydedilecek sahne yok."
      );

      return false;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/api/videos/${videoId}/scenes`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              scenes:
                completeScenes.map(
                  (scene) => ({
                    sceneNumber:
                      scene.id,

                    startTime:
                      scene.startTime,

                    endTime:
                      scene.endTime,
                  })
                ),
            }),
          }
        );

      if (!response.ok) {
        const data =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          data?.error ||
            "Sahneler kaydedilemedi."
        );
      }

      setMessage(
        `${completeScenes.length} sahne kaydedildi.`
      );

      return true;
    } catch (error) {
      console.error(
        "saveScenes error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Sahneler kaydedilemedi."
      );

      return false;
    }
  };

  /*
   * =====================================================
   * FINISH SCENES
   * =====================================================
   */

  const finishScenes = async () => {
    if (
      selectedVideoId === null ||
      !videoRef.current
    ) {
      return;
    }

    const videoDuration =
      videoRef.current.duration;

    if (
      !Number.isFinite(
        videoDuration
      ) ||
      videoDuration <= 0
    ) {
      setMessage(
        "Video süresi alınamadı."
      );

      return;
    }

    const finalScenes =
      buildScenesFromCuts(
        sceneCuts,
        videoDuration
      );

    if (
      finalScenes.length ===
      0
    ) {
      setMessage(
        "En az bir sahne oluşması gerekiyor."
      );

      return;
    }

    setScenes(
      finalScenes
    );

    const success =
      await saveScenes(
        selectedVideoId,
        finalScenes
      );

    videoRef.current.pause();

    setIsPlaying(false);

    if (success) {
      setMessage(
        `${finalScenes.length} sahne oluşturuldu ve kaydedildi.`
      );
    }
  };

  /*
   * =====================================================
   * FORMAT TIME
   * =====================================================
   */

  const formatTime = (
    seconds: number
  ) => {
    if (
      !Number.isFinite(
        seconds
      )
    ) {
      return "0:00";
    }

    const minutes =
      Math.floor(
        seconds / 60
      );

    const secondsPart =
      Math.floor(
        seconds % 60
      );

    return `${minutes}:${secondsPart
      .toString()
      .padStart(2, "0")}`;
  };

  /*
   * =====================================================
   * FORMAT SIZE
   * =====================================================
   */

  const formatSize = (
    bytes: number
  ) => {
    if (
      bytes < 1024 * 1024
    ) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  };

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  return (
    <div className="admin-page">
      {/* =================================================
          HEADER
          ================================================= */}

      <div className="admin-header">
        <p className="eyebrow">
          ADMIN
        </p>

        <h1>
          Video Yönetimi
        </h1>

        <p>
          Videoları yükle,
          sahne kesimlerini
          belirle ve yönet.
        </p>
      </div>

      {/* =================================================
          NEW VIDEO
          ================================================= */}

      <section className="admin-card upload-card">
        <div className="section-title">
          <div>
            <h2>
              Yeni Video
            </h2>

            <p>
              Yeni bir video ekle
              ve sahnelerini
              oluştur.
            </p>
          </div>

          <button
            onClick={() =>
              setUploadOpen(
                (previous) =>
                  !previous
              )
            }
          >
            {uploadOpen
              ? "Kapat"
              : "+ Yeni Video"}
          </button>
        </div>

        {uploadOpen && (
          <div className="upload-form">
            {/* TITLE */}

            <div className="form-group">
              <label>
                Başlık
              </label>

              <input
                type="text"
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target
                      .value
                  )
                }
                placeholder="Örn. Friends Scene 1"
              />
            </div>

            {/* DESCRIPTION */}

            <div className="form-group">
              <label>
                Açıklama
              </label>

              <textarea
                value={
                  description
                }
                onChange={(event) =>
                  setDescription(
                    event.target
                      .value
                  )
                }
                placeholder="Video hakkında kısa açıklama..."
              />
            </div>

            {/* FILE */}

            <div className="form-group">
              <label>
                Video
              </label>

              <input
                id="video-file"
                type="file"
                accept="video/*"
                onChange={(
                  event
                ) =>
                  setFile(
                    event.target
                      .files?.[0] ??
                      null
                  )
                }
              />

              {file && (
                <div className="selected-file">
                  {file.name}
                  {" · "}
                  {formatSize(
                    file.size
                  )}
                </div>
              )}
            </div>

            {/* UPLOAD */}

            <button
              className="upload-button"
              onClick={
                uploadVideo
              }
              disabled={
                uploading
              }
            >
              {uploading
                ? "Yükleniyor..."
                : "Videoyu Yükle"}
            </button>

            {message && (
              <div className="admin-message">
                {message}
              </div>
            )}
          </div>
        )}
      </section>

      {/* =================================================
          VIDEO LIST
          ================================================= */}

      <section className="admin-card">
        <div className="section-title">
          <h2>
            Videolar
          </h2>

          <span>
            {videos.length} video
          </span>
        </div>

        {videos.length ===
        0 ? (
          <div className="empty">
            Henüz video
            yüklenmedi.
          </div>
        ) : (
          <div className="video-list">
            {videos.map(
              (video) => (
                <div
                  className="video-item"
                  key={video.id}
                >
                  <div className="video-preview">
                    <video
                      controls
                      preload="metadata"
                      src={`${API_URL}/api/videos/file/${video.id}`}
                    />
                  </div>

                  <div className="video-info">
                    <h3>
                      {
                        video.title
                      }
                    </h3>

                    <p>
                      {
                        video.description ||
                        "Açıklama bulunmuyor."
                      }
                    </p>

                    <small>
                      {
                        video.original_filename
                      }
                      {" · "}
                      {formatSize(
                        video.size_bytes
                      )}
                    </small>

                    <div className="video-actions">
                      <button
                        onClick={() =>
                          selectVideo(
                            video
                          )
                        }
                      >
                        Sahne Düzenle
                      </button>

                      <button
                        className="delete-button"
                        onClick={() =>
                          deleteVideo(
                            video.id
                          )
                        }
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* =================================================
          SCENE EDITOR
          ================================================= */}

      {selectedVideoId !==
        null && (
        <section className="admin-card scene-editor">
          <div className="section-title">
            <div>
              <h2>
                Sahne Düzenleme
              </h2>

              <p>
                Videoyu izle ve
                sadece kesilmesi
                gereken noktaları
                işaretle.
              </p>
            </div>

            <button
              onClick={() => {
                if (
                  videoRef.current
                ) {
                  videoRef.current.pause();
                }

                setSelectedVideoId(
                  null
                );

                setSceneCuts(
                  []
                );

                setScenes(
                  []
                );

                setCurrentTime(
                  0
                );

                setDuration(
                  0
                );

                setIsPlaying(
                  false
                );
              }}
            >
              Kapat
            </button>
          </div>

          {/* VIDEO */}

          <div className="video-editor">
            <video
              ref={videoRef}
              preload="metadata"
              src={`${API_URL}/api/videos/file/${selectedVideoId}`}
              onLoadedMetadata={(
                event
              ) => {
                setDuration(
                  event.currentTarget
                    .duration
                );
              }}
              onTimeUpdate={(
                event
              ) => {
                setCurrentTime(
                  event.currentTarget
                    .currentTime
                );
              }}
              onPlay={() =>
                setIsPlaying(
                  true
                )
              }
              onPause={() =>
                setIsPlaying(
                  false
                )
              }
              onEnded={() => {
                setIsPlaying(
                  false
                );
              }}
            />
          </div>

          {/* CURRENT TIME */}

          <div className="current-time">
            <strong>
              {formatTime(
                currentTime
              )}
            </strong>

            {" / "}

            <span>
              {formatTime(
                duration
              )}
            </span>

            <span className="current-seconds">
              {currentTime.toFixed(
                2
              )}{" "}
              s
            </span>
          </div>

          {/* CONTROLS */}

          <div className="scene-controls">
            <button
              onClick={
                togglePlay
              }
            >
              {isPlaying
                ? "⏸ Pause"
                : "▶ Play"}
            </button>

            <button
              onClick={
                addSceneCut
              }
              disabled={
                duration <= 0
              }
            >
              ✂ Kesim Noktası
            </button>

            <button
              onClick={
                finishScenes
              }
              disabled={
                duration <= 0
              }
            >
              ✓ Sahnelemeyi Bitir
            </button>
          </div>

          {/* =================================================
              CUT LIST
              ================================================= */}

          <div className="scene-list">
            <div className="scene-list-header">
              <div>
                <h3>
                  Kesim Noktaları
                </h3>

                <p>
                  Videonun başı ve
                  sonu otomatik
                  sınır kabul edilir.
                </p>
              </div>

              <span>
                {sceneCuts.length} kesim
              </span>
            </div>

            {sceneCuts.length ===
            0 ? (
              <div className="empty">
                Henüz kesim
                noktası
                belirlenmedi.
              </div>
            ) : (
              sceneCuts.map(
                (cut) => (
                  <div
                    className="scene-row"
                    key={cut.id}
                  >
                    <div>
                      <strong>
                        Cut{" "}
                        {cut.id}
                      </strong>
                    </div>

                    <div className="scene-time">
                      {formatTime(
                        cut.time
                      )}

                      <span
                        style={{
                          marginLeft:
                            "8px",
                          color:
                            "#777",
                        }}
                      >
                        (
                        {cut.time.toFixed(
                          2
                        )}{" "}
                        s)
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        removeSceneCut(
                          cut.id
                        )
                      }
                      className="delete-button"
                    >
                      Sil
                    </button>
                  </div>
                )
              )
            )}
          </div>

          {/* =================================================
              GENERATED SCENES
              ================================================= */}

          <div className="scene-list">
            <div className="scene-list-header">
              <div>
                <h3>
                  Sahne Aralıkları
                </h3>

                <p>
                  Kesim noktalarından
                  otomatik oluşturulur.
                </p>
              </div>

              <span>
                {scenes.length} sahne
              </span>
            </div>

            {scenes.length ===
            0 ? (
              <div className="empty">
                Kesim noktası
                eklediğinde sahneler
                burada görünecek.
              </div>
            ) : (
              scenes.map(
                (scene) => (
                  <div
                    className="scene-row"
                    key={scene.id}
                  >
                    <div>
                      <strong>
                        Scene{" "}
                        {scene.id}
                      </strong>
                    </div>

                    <div className="scene-time">
                      {formatTime(
                        scene.startTime
                      )}

                      {" → "}

                      {formatTime(
                        scene.endTime
                      )}
                    </div>

                    <div className="scene-duration">
                      {(
                        scene.endTime -
                        scene.startTime
                      ).toFixed(
                        2
                      )}{" "}
                      s
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}