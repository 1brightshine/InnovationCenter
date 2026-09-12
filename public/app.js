const form = document.querySelector('#registration-form');
const status = document.querySelector('.form-status');
const themeToggle = document.querySelector('.theme-toggle');
const heroTrack = document.querySelector('.hero-track');
const carouselProgress = document.querySelector('.carousel-progress b');

if (heroTrack) {
  const slides = heroTrack.querySelectorAll('.hero-slide');
  const previousButton = document.querySelector('.carousel-arrow[data-direction="prev"]');
  const nextButton = document.querySelector('.carousel-arrow[data-direction="next"]');
  const updateCarouselState = (index) => {
    carouselProgress.textContent = String(Math.min(index, slides.length - 1) + 1).padStart(2, '0');
    previousButton.hidden = index === 0;
    nextButton.hidden = index !== 0;
  };
  updateCarouselState(0);
  document.querySelectorAll('.carousel-arrow').forEach((button) => {
    button.addEventListener('click', () => {
      const nextIndex = button.dataset.direction === 'next' ? 1 : 0;
      heroTrack.scrollTo({ left: nextIndex * heroTrack.clientWidth, behavior: 'smooth' });
      updateCarouselState(nextIndex);
    });
  });
  heroTrack.addEventListener('scroll', () => {
    const index = Math.round(heroTrack.scrollLeft / heroTrack.clientWidth);
    updateCarouselState(index);
  });
}

if (form) {
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button');
  submit.disabled = true;
  status.textContent = 'Sending your details...';
  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    status.textContent = result.message;
    form.reset();
  } catch (error) {
    status.textContent = error.message || 'Something went wrong. Please try again.';
  } finally {
    submit.disabled = false;
  }
});
}

if (themeToggle) {
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  themeToggle.textContent = document.body.classList.contains('dark') ? '☀' : '◐';
});
}

document.querySelector('.menu-toggle').addEventListener('click', () => {
  document.querySelector('.desktop-nav').classList.toggle('mobile-open');
});

