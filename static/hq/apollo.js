// Apollo editors have the same existing HQ session, with no new credentials.
(() => {
  const form = document.getElementById('apollo-form');
  const message = document.getElementById('apollo-status');
  const destination = document.getElementById('apollo-destination');
  const video = document.getElementById('apollo-video');
  const current = document.getElementById('apollo-current');
  const reload = document.getElementById('apollo-reload');
  const save = document.getElementById('apollo-save');
  let state = null;
  let generation = 0;
  function show(next) {
    state = next;
    destination.value = next.destination ?? '';
    video.value = next.video ? 'https://www.youtube.com/watch?v=' + next.video : '';
    current.textContent = 'Currently opens: ' + (next.destination || 'Apollo page');
    form.hidden = false;
  }
  async function load() {
    const id = ++generation;
    state = null;
    form.hidden = true;
    reload.disabled = true;
    message.textContent = 'Loading Apollo settings…';
    try {
      const r = await api('apollo');
      if (generation !== id) return;
      show(r.state);
      message.textContent = '';
    } catch (e) {
      if (generation === id) message.textContent = e.message;
    } finally {
      if (generation === id) reload.disabled = false;
    }
  }
  window.loadApolloSettings = load;
  window.clearApolloSettings = () => {
    ++generation;
    state = null;
    form.reset(); form.hidden = true;
    current.textContent = message.textContent = '';
    save.disabled = reload.disabled = false;
  };
  reload.addEventListener('click', load);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state || save.disabled) return;
    const id = generation;
    save.disabled = reload.disabled = true;
    message.textContent = 'Saving…';
    try {
      const r = await api('apollo', {method:'PATCH',body:{revision:state.revision,destination:destination.value.trim(),video:video.value.trim()}});
      if (generation !== id) return;
      show(r.state);
      message.textContent = 'Saved. Open the permanent QR link to check your change.';
    } catch (e) {
      if (generation === id) message.textContent = e.message;
    } finally {
      save.disabled = false;
      if (generation === id) reload.disabled = false;
    }
  });
})();
