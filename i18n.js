/*
 * i18n.js — every piece of visible text lives here.
 * The English poem is marked DRAFT for review.
 */

window.TRANSLATIONS = {
  vi: {
    meta: {
      title: "Sylvan Muse — Phòng tranh nhỏ giữa rừng",
      description: "Một phòng tranh nhỏ: một bức ảnh, một bài thơ và cả một khu rừng.",
    },
    gallery: {
      name: "Sylvan Muse",
      tagline: "Phòng tranh giữa rừng",
    },
    threshold: {
      prompt: "Chọn ngôn ngữ",
      choiceVi: "Tiếng Việt",
      choiceEn: "English",
    },
    entrance: {
      welcome: "Chào mừng bạn.",
      line2: "Hãy bước vào thật chậm nhé.",
      cue: "Chạm để bước vào",
    },
    story: {
      label: "Câu chuyện phía sau bức ảnh",
      lines: [
        "Trên con đường mòn vắng lặng,\nsâu trong rừng,\nanh ấy chẳng tìm kiếm điều gì.",
        "Rồi giữa những hàng cây,\nmột đóa hoa khẽ đón lấy ánh nắng.",
        "Anh ấy dừng chân. Nín thở.",
        "Và khẽ bấm máy.",
        "Đây là khoảnh khắc\ntác giả đã nhìn thấy.",
      ],
    },
    hall: {
      imageAlt:
        "Một cô gái mặc áo khoác màu ô liu một mình bước trên lối mòn phủ lá, giữa những hàng cây cao ngập nắng vàng cuối thu.",
      placardLabel: "Thông tin tác phẩm",
      titleLabel: "Tác phẩm",
      photographerLabel: "Chụp bởi",
      placeLabel: "Chụp tại",
      yearLabel: "Ngày chụp",
      artworkTitle: "Nơi thơ nở",
      photographer: "Khoazd",
      signature: "Tặng Evie",
      place: "Conkle's Hollow, Hocking Hills, Ohio",
      year: "18 tháng 10, 2026",
      poemLabel: "Bài thơ",
      details: "Thông tin",
      hidePlacard: "Chạm để thổi bay tấm thẻ",
    },
    // Nguyên văn — mỗi khổ thơ là một mảng, mỗi dòng là một chuỗi.
    poem: [
      ["Đại ngàn ôm bóng nhỏ, thơ nở giữa rừng cây…"],
    ],
    music: {
      track: "Holocene · Bon Iver",
      listen: "Nghe trọn bài trên Apple Music ↗",
      mute: "Tắt nhạc",
      unmute: "Bật nhạc",
    },
    question: {
      prompt: "Bạn có thích bức ảnh này không?",
      yes: "Có, mình thích lắm",
      no: "Mình chỉ ghé ngang thôi",
    },
    farewell: {
      noteLabel: "Để lại đôi lời cho tác giả",
      notePlaceholder: "Viết gì cũng được, hoặc để trống…",
      send: "Gửi đi",
      sending: "Đang gửi…",
      error: "Chưa gửi được rồi. Bạn thử lại giúp mình nhé.",
      thanksYes:
        "Cảm ơn bạn đã ghé thăm phòng tranh. Tình cảm của bạn đã được gửi tới tác giả rồi.",
      thanksNo:
        "Cảm ơn bạn đã ghé qua. Khu rừng vẫn luôn ở đây, chờ bạn quay lại.",
      thanksSkip: "Cảm ơn bạn đã ghé thăm phòng tranh. Mong khu rừng đã cho bạn một chút bình yên.",
      close: "Đóng",
      again: "Dạo lại một vòng",
      ticket: "Lưu vé tham quan",
      share: "Chia sẻ khu rừng này",
      copied: "Đã sao chép liên kết.",
      saved: "Vé đã sẵn sàng.",
    },
    ticket: {
      brand: "SYLVAN MUSE · PHÒNG TRANH NHỎ GIỮA RỪNG",
      admit: "Vé dành riêng cho bạn",
      visited: "Ghé thăm",
      number: "Số 001",
      file: "ve-sylvan-muse.png",
    },
    hint: {
      skip: "Chạm hoặc nhấn phím cách để đi tiếp",
    },
  },

  en: {
    meta: {
      title: "Sylvan Muse — A gallery in the forest",
      description: "A small gallery: one photograph, one poem, and a forest.",
    },
    gallery: {
      name: "Sylvan Muse",
      tagline: "A gallery in the forest",
    },
    threshold: {
      prompt: "Choose your language",
      choiceVi: "Tiếng Việt",
      choiceEn: "English",
    },
    entrance: {
      welcome: "Welcome.",
      line2: "Please walk slowly.",
      cue: "Tap to enter",
    },
    story: {
      label: "The story behind the photograph",
      lines: [
        "On a quiet trail, deep in the forest,\nhe wasn't looking for anything.",
        "Then, between the trees,\na single flower caught the light.",
        "He stopped. He held his breath.",
        "And he took the shot.",
        "This is what he saw.",
      ],
    },
    hall: {
      imageAlt:
        "A woman in an olive jacket walks alone down a leaf-covered trail between tall trees glowing in late-autumn golden light.",
      placardLabel: "About the artwork",
      titleLabel: "Title",
      photographerLabel: "Photographer",
      placeLabel: "Place",
      yearLabel: "Taken",
      artworkTitle: "Where the Poem Blooms",
      photographer: "Khoazd",
      signature: "For Evie",
      place: "Conkle's Hollow, Hocking Hills, Ohio",
      year: "October 18, 2026",
      poemLabel: "Poem",
      details: "Details",
      hidePlacard: "Tap to blow the label away",
    },
    // DRAFT — English translation for review.
    poem: [
      ["The great forest cradles a small figure;", "a poem blooms among the trees…"],
    ],
    music: {
      track: "Holocene · Bon Iver",
      listen: "Listen on Apple Music ↗",
      mute: "Mute music",
      unmute: "Play music",
    },
    question: {
      prompt: "Did you like it?",
      yes: "Yes, I love it",
      no: "Just passing by",
    },
    farewell: {
      noteLabel: "Leave a note for the artist",
      notePlaceholder: "Optional…",
      send: "Send",
      sending: "Sending…",
      error: "That didn't go through. Please try again.",
      thanksYes:
        "Thank you for visiting this gallery. Your love has been sent to the artist.",
      thanksNo:
        "Thank you for walking through. The forest will be here whenever you return.",
      thanksSkip: "Thank you for visiting this gallery. I hope the forest gave you a moment of quiet.",
      close: "Close",
      again: "Visit again",
      ticket: "Save your ticket",
      share: "Share this forest",
      copied: "Link copied.",
      saved: "Your ticket is ready.",
    },
    ticket: {
      brand: "SYLVAN MUSE · A SMALL GALLERY IN THE FOREST",
      admit: "Admit one — just you",
      visited: "Visited",
      number: "No. 001",
      file: "sylvan-muse-ticket.png",
    },
    hint: {
      skip: "Tap or press Space to continue",
    },
  },
};
