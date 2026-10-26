import type { Lesson } from '@/lib/types';

export const mockLesson: Lesson = {
  steps: [
    { emoji: '🛑', text: 'Tắt máy ép trước khi kiểm tra.' },
    { emoji: '🙌', text: 'Đặt hai tay lên hai nút bấm cùng lúc.' },
    { emoji: '🔘', text: 'Kiểm tra cả hai nút đều nhạy và bấm được.' },
    { emoji: '✅', text: 'Nếu có nút bị hỏng, báo ngay cho quản lý.' },
  ],
  quiz: [
    {
      question: 'Trước khi làm việc với máy ép, bạn phải làm gì?',
      options: [
        { emoji: '🙌', text: 'Kiểm tra hai nút bấm bằng hai tay' },
        { emoji: '📱', text: 'Gọi điện thoại cho bạn bè' },
        { emoji: '🏃', text: 'Bắt đầu làm việc ngay' },
      ],
      answerIndex: 0,
    },
    {
      question: 'Nếu một nút bị hỏng thì sao?',
      options: [
        { emoji: '🤫', text: 'Không nói với ai' },
        { emoji: '🔧', text: 'Tự sửa máy' },
        { emoji: '📢', text: 'Báo ngay cho quản lý' },
      ],
      answerIndex: 2,
    },
    {
      question: 'Khi kiểm tra nút, máy ép phải ở trạng thái nào?',
      options: [
        { emoji: '⚡', text: 'Đang chạy' },
        { emoji: '🛑', text: 'Đã tắt' },
        { emoji: '🔥', text: 'Đang nóng' },
      ],
      answerIndex: 1,
    },
  ],
  ui: {
    submit: 'Nộp bài',
    passed: 'Đạt! Bạn đã hiểu.',
    failed: 'Chưa đạt. Hãy xem lại.',
    waiting: 'Đang chờ quản lý duyệt...',
  },
};
