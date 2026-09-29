const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;

const games = new Map();
const results = new Map();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const adminTokens = new Set();

const grades = ["4", "5", "6", "7", "8", "Diger"];

const primes = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
  31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97
];

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(JSON.stringify(data));
}

function shuffle(array) {
  const a = [...array];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function readBody(req) {
  return new Promise((resolve, reject) => {

    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {

      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }

    });

    req.on("error", reject);

  });
}

function cleanName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getLeaderboard(grade) {

  const list = [];

  for (const result of results.values()) {

    if (result.grade === grade) {
      list.push(result);
    }

  }

  list.sort((a, b) => {

    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.timeMs - b.timeMs;

  });

  return list.slice(0, 100);
}

function formatTime(ms) {

  const totalSeconds =
    Math.floor(ms / 1000);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}


const server = http.createServer(async (req, res) => {

  /*
    URL BİLGİSİ
    Bu bölüm mutlaka createServer
    bloğunun içinde olmalıdır.
  */

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );


  // =========================
  // YÖNETİCİ GİRİŞİ
  // =========================

  if (
    req.method === "POST" &&
    url.pathname === "/api/admin/login"
  ) {

    try {

      const body =
        await readBody(req);

      const password =
        String(body.password || "");


      if (
        !ADMIN_PASSWORD ||
        password !== ADMIN_PASSWORD
      ) {

        return send(res, 401, {
          error: "Yönetici şifresi hatalı."
        });

      }


      const token =
        crypto.randomUUID();

      adminTokens.add(token);


      return send(res, 200, {
        success: true,
        token
      });


    } catch (error) {

      return send(res, 400, {
        error: "Giriş yapılamadı."
      });

    }

  }


  // =========================
  // YÖNETİCİ SONUÇLARI
  // =========================

  if (
    req.method === "GET" &&
    url.pathname === "/api/admin/results"
  ) {

    const token =
      req.headers["x-admin-token"];


    if (
      !token ||
      !adminTokens.has(token)
    ) {

      return send(res, 401, {
        error: "Yetkisiz erişim."
      });

    }


    const grade =
      String(
        url.searchParams.get("grade") || ""
      );


    if (!grades.includes(grade)) {

      return send(res, 400, {
        error: "Geçersiz sınıf."
      });

    }


    return send(res, 200, {
      results: getLeaderboard(grade)
    });

  }


  // =========================
  // CORS / OPTIONS
  // =========================

  if (req.method === "OPTIONS") {

    res.writeHead(204, {

      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Headers":
        "Content-Type, X-Admin-Token",

      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS"

    });

    return res.end();

  }


  // =========================
  // OYUNU BAŞLAT
  // =========================

  if (
    req.method === "POST" &&
    url.pathname === "/api/start"
  ) {

    try {

      const body =
        await readBody(req);


      const name =
        cleanName(body.name);


      let grade =
        String(body.grade || "").trim();


      if (grade.includes("4")) {

        grade = "4";

      } else if (grade.includes("5")) {

        grade = "5";

      } else if (grade.includes("6")) {

        grade = "6";

      } else if (grade.includes("7")) {

        grade = "7";

      } else if (grade.includes("8")) {

        grade = "8";

      } else if (
        grade
          .toLocaleLowerCase("tr-TR")
          .includes("diğer") ||
        grade
          .toLocaleLowerCase("tr-TR")
          .includes("diger")
      ) {

        grade = "Diger";

      }


      const avatar =
        String(body.avatar || "😀");


      if (!name) {

        return send(res, 400, {
          error: "Ad soyad gerekli."
        });

      }


      if (!grades.includes(grade)) {

        return send(res, 400, {
          error: "Geçersiz sınıf."
        });

      }


      const gameId =
        crypto.randomUUID();


      const questions =
        shuffle(primes);


      games.set(gameId, {

        gameId,

        name,

        grade,

        avatar,

        questions,

        answers: new Map(),

        startAt: Date.now(),

        finished: false

      });


      return send(res, 200, {

        gameId,

        questions

      });


    } catch (error) {

      return send(res, 400, {
        error: "Oyun başlatılamadı."
      });

    }

  }


  // =========================
  // CEVABI KONTROL ET
  // =========================

  if (
    req.method === "POST" &&
    url.pathname === "/api/answer"
  ) {

    try {

      const body =
        await readBody(req);


      const game =
        games.get(
          String(body.gameId || "")
        );


      const index =
        Number(body.index);


      const answer =
        Number(body.answer);


      if (!game) {

        return send(res, 404, {
          error: "Oyun bulunamadı."
        });

      }


      if (game.finished) {

        return send(res, 400, {
          error: "Oyun tamamlanmış."
        });

      }


      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= 25
      ) {

        return send(res, 400, {
          error: "Geçersiz soru."
        });

      }


      if (game.answers.has(index)) {

        return send(res, 400, {
          error: "Bu soru daha önce cevaplandı."
        });

      }


      const correctAnswer =
        game.questions[index];


      const correct =
        answer === correctAnswer;


      game.answers.set(index, {

        answer,

        correct

      });


      let score = 0;


      for (
        const item of game.answers.values()
      ) {

        if (item.correct) {
          score += 4;
        }

      }


      return send(res, 200, {

        correct,

        score

      });


    } catch (error) {

      return send(res, 400, {
        error: "Cevap işlenemedi."
      });

    }

  }


  // =========================
  // OYUNU BİTİR
  // =========================

  if (
    req.method === "POST" &&
    url.pathname === "/api/finish"
  ) {

    try {

      const body =
        await readBody(req);


      const game =
        games.get(
          String(body.gameId || "")
        );


      if (!game) {

        return send(res, 404, {
          error: "Oyun bulunamadı."
        });

      }


      if (game.finished) {

        return send(res, 400, {
          error: "Bu oyun zaten tamamlandı."
        });

      }


      game.finished = true;


      let correct = 0;


      for (
        const item of game.answers.values()
      ) {

        if (item.correct) {
          correct++;
        }

      }


      const score =
        correct * 4;


      const timeMs =
        Math.max(
          0,
          Date.now() - game.startAt
        );


      const key =
        game.grade +
        "|" +
        game.name.toLocaleLowerCase("tr-TR");


      const result = {

        name: game.name,

        grade: game.grade,

        avatar: game.avatar,

        correct,

        score,

        timeMs,

        timeStr: formatTime(timeMs)

      };


      const old =
        results.get(key);


      let saved = false;


      if (
        !old ||
        score > old.score ||
        (
          score === old.score &&
          timeMs < old.timeMs
        )
      ) {

        results.set(
          key,
          result
        );

        saved = true;

      }


      return send(res, 200, {

        saved,

        result:
          saved
            ? result
            : old,

        leaderboard:
          getLeaderboard(game.grade)

      });


    } catch (error) {

      return send(res, 400, {
        error: "Oyun tamamlanamadı."
      });

    }

  }


  // =========================
  // GENEL SIRALAMA
  // =========================

  if (
    req.method === "GET" &&
    url.pathname === "/api/leaderboard"
  ) {

    const grade =
      String(
        url.searchParams.get("grade") || ""
      );


    if (!grades.includes(grade)) {

      return send(res, 400, {
        error: "Geçersiz sınıf."
      });

    }


    return send(res, 200, {

      results:
        getLeaderboard(grade)

    });

  }


  // =========================
  // YÖNETİCİ SAYFASI
  // =========================

  if (
    req.method === "GET" &&
    url.pathname === "/yonetici"
  ) {

    const file =
      path.join(
        __dirname,
        "public",
        "yonetici.html"
      );


    if (!fs.existsSync(file)) {

      return send(res, 404, {
        error:
          "public/yonetici.html bulunamadı."
      });

    }


    res.writeHead(200, {

      "Content-Type":
        "text/html; charset=utf-8"

    });


    return fs
      .createReadStream(file)
      .pipe(res);

  }


  // =========================
  // ANA SAYFA
  // =========================

  if (
    req.method === "GET" &&
    (
      url.pathname === "/" ||
      url.pathname === "/index.html"
    )
  ) {

    const file =
      path.join(
        __dirname,
        "public",
        "index.html"
      );


    if (!fs.existsSync(file)) {

      return send(res, 404, {
        error:
          "public/index.html bulunamadı."
      });

    }


    res.writeHead(200, {

      "Content-Type":
        "text/html; charset=utf-8"

    });


    return fs
      .createReadStream(file)
      .pipe(res);

  }


  // =========================
  // BULUNAMAYAN SAYFA
  // =========================

  res.writeHead(404, {

    "Content-Type":
      "text/plain; charset=utf-8"

  });


  res.end("Sayfa bulunamadı.");

});


server.listen(PORT, () => {

  console.log(
    `HANGİSİ ASAL sunucusu ${PORT} portunda çalışıyor.`
  );

});
