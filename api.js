
const API_URL =
  "https://clientbp.ppmainecoonghj.com/EhangeWishListItem";

const TIMEOUT_MS = 15000;

export async function wishlistRequest({
  uid,
  password,
  action,
  itemIds = []
}) {
  if (!uid || !password) {
    throw new Error("Thiếu thông tin xác thực.");
  }

  if (!["list", "add", "remove"].includes(action)) {
    throw new Error("Thao tác không hợp lệ.");
  }

  if (!Array.isArray(itemIds) || itemIds.length > 100) {
    throw new Error("Danh sách ID không hợp lệ.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        guest_uid: uid,
        guest_password: password,
        action,
        item_ids: itemIds
      })
    });

    const raw = await response.text();
    let data = null;

    if (raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `API không trả JSON hợp lệ (HTTP ${response.status}).`
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `Yêu cầu thất bại: HTTP ${response.status}.`
      );
    }

    if (data === null) {
      throw new Error("API trả về phản hồi rỗng.");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("API quá thời gian chờ.");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Không thể kết nối API. Kiểm tra CORS, HTTPS và mạng."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
