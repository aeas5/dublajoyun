export interface Env {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
}

/*
 * =========================================================
 * CORS
 * =========================================================
 */

function corsHeaders(
  request: Request
) {
  const origin =
    request.headers.get("Origin");

  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];

  return {
    "Access-Control-Allow-Origin":
      origin &&
      allowedOrigins.includes(origin)
        ? origin
        : "*",

    "Access-Control-Allow-Methods":
      "GET, POST, DELETE, OPTIONS",

    "Access-Control-Allow-Headers":
      [
        "Content-Type",
        "X-Video-Title",
        "X-Video-Description",
        "X-Original-Filename",
      ].join(", "),

    "Access-Control-Max-Age":
      "86400",
  };
}

/*
 * =========================================================
 * JSON RESPONSE
 * =========================================================
 */

function json(
  data: unknown,
  request: Request,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        ...corsHeaders(
          request
        ),
      },
    }
  );
}

/*
 * =========================================================
 * WORKER
 * =========================================================
 */

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(
      request.url
    );

    /*
     * =====================================================
     * CORS PREFLIGHT
     * =====================================================
     */

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,

          headers:
            corsHeaders(
              request
            ),
        }
      );
    }

    /*
     * =====================================================
     * HOME
     * =====================================================
     */

    if (
      url.pathname === "/" &&
      request.method === "GET"
    ) {
      return json(
        {
          message:
            "Dublaj Worker çalışıyor",

          database:
            "connected",

          storage:
            "connected",
        },

        request
      );
    }

    /*
     * =====================================================
     * UPLOAD VIDEO
     *
     * POST /api/videos/upload
     * =====================================================
     */

    if (
      url.pathname ===
        "/api/videos/upload" &&
      request.method === "POST"
    ) {
      const titleHeader =
        request.headers.get(
          "X-Video-Title"
        );

      const descriptionHeader =
        request.headers.get(
          "X-Video-Description"
        ) ?? "";

      const originalFilenameHeader =
        request.headers.get(
          "X-Original-Filename"
        );

      const contentType =
        request.headers.get(
          "Content-Type"
        ) ??
        "application/octet-stream";

      const contentLength =
        request.headers.get(
          "Content-Length"
        );

      /*
       * Frontend encodeURIComponent
       * kullandığı için decode ediyoruz.
       */

      const title =
        titleHeader
          ? decodeURIComponent(
              titleHeader
            )
          : "";

      const description =
        decodeURIComponent(
          descriptionHeader
        );

      const originalFilename =
        originalFilenameHeader
          ? decodeURIComponent(
              originalFilenameHeader
            )
          : "";

      if (!title) {
        return json(
          {
            error:
              "Video title gerekli.",
          },

          request,

          400
        );
      }

      if (
        !originalFilename
      ) {
        return json(
          {
            error:
              "Dosya adı gerekli.",
          },

          request,

          400
        );
      }

      if (!request.body) {
        return json(
          {
            error:
              "Video body bulunamadı.",
          },

          request,

          400
        );
      }

      /*
       * Şimdilik Worker Free plan
       * sınırı nedeniyle 100 MB.
       */

      const size =
        contentLength
          ? Number(
              contentLength
            )
          : 0;

      const MAX_SIZE =
        100 *
        1024 *
        1024;

      if (
        size > MAX_SIZE
      ) {
        return json(
          {
            error:
              "Video 100 MB'dan büyük.",
          },

          request,

          413
        );
      }

      /*
       * Unique storage ID
       */

      const id =
        crypto.randomUUID();

      /*
       * Extension
       */

      const extension =
        originalFilename.includes(
          "."
        )
          ? originalFilename
              .split(".")
              .pop()
              ?.toLowerCase() ??
            "bin"
          : "bin";

      const storageKey =
        `videos/${id}/video.${extension}`;

      /*
       * R2 upload
       *
       * request.body doğrudan R2'ye
       * stream ediliyor.
       */

      await env.MEDIA_BUCKET.put(
        storageKey,
        request.body,
        {
          httpMetadata: {
            contentType,
          },
        }
      );

      /*
       * D1
       */

      const result =
        await env.DB.prepare(
          `
          INSERT INTO videos (
            title,
            description,
            storage_key,
            original_filename,
            mime_type,
            size_bytes
          )
          VALUES (?, ?, ?, ?, ?, ?)
          `
        )
          .bind(
            title,
            description,
            storageKey,
            originalFilename,
            contentType,
            size
          )
          .run();

      return json(
        {
          success:
            true,

          video: {
            id:
              result.meta
                ?.last_row_id,

            title,

            description,

            storageKey,

            filename:
              originalFilename,
          },
        },

        request,

        201
      );
    }

    /*
     * =====================================================
     * GET SCENES
     *
     * GET /api/videos/:videoId/scenes
     * =====================================================
     */

    if (
      url.pathname.match(
        /^\/api\/videos\/\d+\/scenes$/
      ) &&
      request.method === "GET"
    ) {
      const parts =
        url.pathname.split(
          "/"
        );

      const videoId =
        Number(
          parts[3]
        );

      if (
        !Number.isInteger(
          videoId
        )
      ) {
        return json(
          {
            error:
              "Geçersiz video ID.",
          },

          request,

          400
        );
      }

      const result =
        await env.DB.prepare(
          `
          SELECT
            id,
            video_id,
            scene_number,
            start_time,
            end_time,
            created_at
          FROM scenes
          WHERE video_id = ?
          ORDER BY scene_number ASC
          `
        )
          .bind(
            videoId
          )
          .all();

      return json(
        result.results,

        request
      );
    }

    /*
     * =====================================================
     * SAVE SCENES
     *
     * POST /api/videos/:videoId/scenes
     * =====================================================
     */

    if (
      url.pathname.match(
        /^\/api\/videos\/\d+\/scenes$/
      ) &&
      request.method === "POST"
    ) {
      const parts =
        url.pathname.split(
          "/"
        );

      const videoId =
        Number(
          parts[3]
        );

      if (
        !Number.isInteger(
          videoId
        )
      ) {
        return json(
          {
            error:
              "Geçersiz video ID.",
          },

          request,

          400
        );
      }

      /*
       * Video var mı?
       */

      const video =
        await env.DB.prepare(
          `
          SELECT id
          FROM videos
          WHERE id = ?
          `
        )
          .bind(
            videoId
          )
          .first();

      if (!video) {
        return json(
          {
            error:
              "Video bulunamadı.",
          },

          request,

          404
        );
      }

      /*
       * JSON
       */

      let body: {
        scenes: {
          sceneNumber: number;
          startTime: number;
          endTime: number;
        }[];
      };

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            error:
              "Geçersiz JSON.",
          },

          request,

          400
        );
      }

      if (
        !Array.isArray(
          body.scenes
        ) ||
        body.scenes.length ===
          0
      ) {
        return json(
          {
            error:
              "En az bir sahne gerekli.",
          },

          request,

          400
        );
      }

      /*
       * Scene validation
       */

      for (
        const scene of body.scenes
      ) {
        if (
          !Number.isInteger(
            scene.sceneNumber
          )
        ) {
          return json(
            {
              error:
                "Geçersiz sceneNumber.",
            },

            request,

            400
          );
        }

        if (
          !Number.isFinite(
            scene.startTime
          ) ||
          !Number.isFinite(
            scene.endTime
          )
        ) {
          return json(
            {
              error:
                "Geçersiz zaman.",
            },

            request,

            400
          );
        }

        if (
          scene.startTime < 0
        ) {
          return json(
            {
              error:
                "startTime negatif olamaz.",
            },

            request,

            400
          );
        }

        if (
          scene.endTime <=
          scene.startTime
        ) {
          return json(
            {
              error:
                "endTime startTime'dan büyük olmalı.",
            },

            request,

            400
          );
        }
      }

      /*
       * Eski sahneleri sil.
       */

      await env.DB.prepare(
        `
        DELETE FROM scenes
        WHERE video_id = ?
        `
      )
        .bind(
          videoId
        )
        .run();

      /*
       * Yeni sahneleri batch olarak yaz.
       */

      const statements =
        body.scenes.map(
          (
            scene
          ) =>
            env.DB.prepare(
              `
              INSERT INTO scenes (
                video_id,
                scene_number,
                start_time,
                end_time
              )
              VALUES (?, ?, ?, ?)
              `
            ).bind(
              videoId,

              scene.sceneNumber,

              scene.startTime,

              scene.endTime
            )
        );

      await env.DB.batch(
        statements
      );

      return json(
        {
          success:
            true,

          videoId,

          scenesSaved:
            body.scenes.length,
        },

        request
      );
    }

    /*
     * =====================================================
     * GET VIDEO FILE
     *
     * GET /api/videos/file/:id
     *
     * RANGE SUPPORTED
     * =====================================================
     */

    if (
      url.pathname.startsWith(
        "/api/videos/file/"
      ) &&
      request.method === "GET"
    ) {
      const id =
        Number(
          url.pathname
            .split("/")
            .pop()
        );

      if (
        !Number.isInteger(
          id
        )
      ) {
        return json(
          {
            error:
              "Geçersiz video ID.",
          },

          request,

          400
        );
      }

      /*
       * D1
       */

      const video =
        await env.DB.prepare(
          `
          SELECT
            storage_key,
            mime_type,
            original_filename
          FROM videos
          WHERE id = ?
          `
        )
          .bind(
            id
          )
          .first<{
            storage_key: string;
            mime_type: string;
            original_filename: string;
          }>();

      if (!video) {
        return json(
          {
            error:
              "Video bulunamadı.",
          },

          request,

          404
        );
      }

      /*
       * Range header
       */

      const rangeHeader =
        request.headers.get(
          "Range"
        );

      let object: R2ObjectBody | null;

      if (rangeHeader) {
        /*
         * R2 supports HTTP Range through
         * the range option.
         */
        object =
          await env.MEDIA_BUCKET.get(
            video.storage_key,
            {
              range: request.headers,
            }
          );
      } else {
        object =
          await env.MEDIA_BUCKET.get(
            video.storage_key
          );
      }

      if (!object) {
        return json(
          {
            error:
              "Video dosyası R2'de bulunamadı.",
          },

          request,

          404
        );
      }

      /*
       * Headers
       */

      const headers =
        new Headers();

      object.writeHttpMetadata(
        headers
      );

      headers.set(
        "Accept-Ranges",
        "bytes"
      );

      headers.set(
        "Content-Type",
        video.mime_type ||
          "video/mp4"
      );

      headers.set(
        "Cache-Control",
        "public, max-age=3600"
      );

      headers.set(
        "ETag",
        object.httpEtag
      );

      /*
       * Range response
       */

		if (
		object.range &&
		"offset" in object.range &&
		typeof object.range.offset === "number"
		) {
		const offset = object.range.offset;

		const length =
			typeof object.range.length === "number"
			? object.range.length
			: object.size - offset;

		headers.set(
			"Content-Range",
			`bytes ${offset}-${offset + length - 1}/${object.size}`
		);

		headers.set(
			"Content-Length",
			String(length)
		);

		return new Response(
			object.body,
			{
			status: 206,
			headers,
			}
		);
		}

      /*
       * Full response
       */

      headers.set(
        "Content-Length",
        String(
          object.size
        )
      );

      return new Response(
        object.body,

        {
          status: 200,

          headers,
        }
      );
    }

    /*
     * =====================================================
     * LIST VIDEOS
     *
     * GET /api/videos
     * =====================================================
     */

    if (
      url.pathname ===
        "/api/videos" &&
      request.method === "GET"
    ) {
      const result =
        await env.DB.prepare(
          `
          SELECT
            id,
            title,
            description,
            storage_key,
            original_filename,
            mime_type,
            size_bytes,
            created_at
          FROM videos
          ORDER BY id DESC
          `
        ).all();

      return json(
        result.results,

        request
      );
    }

    /*
     * =====================================================
     * DELETE VIDEO
     *
     * DELETE /api/videos/:id
     * =====================================================
     */

    if (
      url.pathname.startsWith(
        "/api/videos/"
      ) &&
      request.method === "DELETE"
    ) {
      const id =
        Number(
          url.pathname
            .split("/")
            .pop()
        );

      if (
        !Number.isInteger(
          id
        )
      ) {
        return json(
          {
            error:
              "Geçersiz video ID.",
          },

          request,

          400
        );
      }

      /*
       * Video kaydını bul.
       */

      const video =
        await env.DB.prepare(
          `
          SELECT
            storage_key
          FROM videos
          WHERE id = ?
          `
        )
          .bind(
            id
          )
          .first<{
            storage_key: string;
          }>();

      if (!video) {
        return json(
          {
            error:
              "Video bulunamadı.",
          },

          request,

          404
        );
      }

      try {
        /*
         * 1. Scenes
         */

        await env.DB.prepare(
          `
          DELETE FROM scenes
          WHERE video_id = ?
          `
        )
          .bind(
            id
          )
          .run();

        /*
         * 2. R2
         */

        await env.MEDIA_BUCKET.delete(
          video.storage_key
        );

        /*
         * 3. Video row
         */

        await env.DB.prepare(
          `
          DELETE FROM videos
          WHERE id = ?
          `
        )
          .bind(
            id
          )
          .run();

        return json(
          {
            success:
              true,
          },

          request
        );
      } catch (error) {
        console.error(
          "DELETE VIDEO ERROR:",
          error
        );

        return json(
          {
            error:
              "Video silinirken hata oluştu.",

            details:
              String(
                error
              ),
          },

          request,

          500
        );
      }
    }

    /*
     * =====================================================
     * TEST R2
     *
     * GET /test/r2
     * =====================================================
     */

    if (
      url.pathname ===
        "/test/r2" &&
      request.method === "GET"
    ) {
      await env.MEDIA_BUCKET.put(
        "test/hello.txt",
        "Dublaj R2 çalışıyor!"
      );

      return json(
        {
          success:
            true,

          key:
            "test/hello.txt",
        },

        request
      );
    }

    /*
     * =====================================================
     * TEST D1
     *
     * GET /test/d1
     * =====================================================
     */

    if (
      url.pathname ===
        "/test/d1" &&
      request.method === "GET"
    ) {
      const result =
        await env.DB.prepare(
          `
          SELECT
            name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
          `
        ).all();

      return json(
        {
          success:
            true,

          tables:
            result.results,
        },

        request
      );
    }

    /*
     * =====================================================
     * NOT FOUND
     * =====================================================
     */

    return json(
      {
        error:
          "Not Found",
      },

      request,

      404
    );
  },
};