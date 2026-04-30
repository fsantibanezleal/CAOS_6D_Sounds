# References

Curated bibliography for the audio analysis and dimensionality-reduction
techniques used by Auralis.

## Dimensionality reduction

- **PCA** — Pearson, K. (1901). *On lines and planes of closest fit to
  systems of points in space*. Philosophical Magazine, 2(11), 559–572.
  Foundational paper on principal component analysis.

- **t-SNE** — van der Maaten, L., & Hinton, G. (2008). *Visualizing data
  using t-SNE*. Journal of Machine Learning Research, 9(86), 2579–2605.
  [pdf](https://www.jmlr.org/papers/volume9/vandermaaten08a/vandermaaten08a.pdf)

- **UMAP** — McInnes, L., Healy, J., & Melville, J. (2018). *UMAP:
  Uniform Manifold Approximation and Projection for Dimension
  Reduction*. arXiv:1802.03426.
  [arXiv](https://arxiv.org/abs/1802.03426) ·
  [docs](https://umap-learn.readthedocs.io/)

- **Survey** — Espadoto, M., Martins, R. M., Kerren, A., Hirata, N. S. T.,
  & Telea, A. C. (2021). *Toward a Quantitative Survey of Dimension
  Reduction Techniques*. IEEE TVCG. Useful comparative ground for picking
  PCA vs. t-SNE vs. UMAP for visualization.

- **2025 review** — *Comprehensive review of dimensionality reduction
  algorithms: challenges, limitations, and innovative solutions*.
  PeerJ Computer Science (2025). Recent overview that covers t-SNE / UMAP
  alongside spectral methods.

## Audio features

- **MFCCs** — Logan, B. (2000). *Mel Frequency Cepstral Coefficients for
  Music Modeling*. ISMIR. The classical paper that introduced MFCCs to
  music information retrieval.

- **Spectral descriptors** — Peeters, G. (2004). *A large set of audio
  features for sound description (similarity and classification) in the
  Cuidado project*. IRCAM. The reference catalogue for centroid, rolloff,
  bandwidth, flatness, contrast.

- **Pitch tracking** — De Cheveigné, A., & Kawahara, H. (2002). *YIN, a
  fundamental frequency estimator for speech and music*. Journal of the
  Acoustical Society of America, 111(4), 1917–1930.

- **librosa** — McFee, B., et al. (2015). *librosa: Audio and Music
  Signal Analysis in Python*. Proceedings of the 14th Python in Science
  Conference. The library powering our feature extraction.

## Deep audio embeddings (future work)

- **OpenL3** — Cramer, J., Wu, H.-H., Salamon, J., & Bello, J. P. (2019).
  *Look, Listen, and Learn More: Design Choices for Deep Audio Embeddings*.
  ICASSP. Self-supervised AVC pre-training; the embeddings are
  general-purpose audio descriptors.
  [github](https://github.com/marl/openl3)

- **PANNs** — Kong, Q., Cao, Y., Iqbal, T., Wang, Y., Wang, W., & Plumbley,
  M. D. (2020). *PANNs: Large-Scale Pretrained Audio Neural Networks for
  Audio Pattern Recognition*. arXiv:1912.10211.
  [arXiv](https://arxiv.org/abs/1912.10211)

- **PaSST** — Koutini, K., Schlüter, J., Eghbal-zadeh, H., & Widmer, G.
  (2022). *Efficient Training of Audio Transformers with Patchout*.
  [pdf](https://proceedings.mlr.press/v166/koutini22a/koutini22a.pdf)

## Visualization with audio

- **Real-time sound viz via clustering** — Vidiella, B., Borrelly, J. J.,
  & Sayama, H. (2021). *Real-time Sound Visualization via Multidimensional
  Clustering and Projections*. ICAIT.
  [acm](https://dl.acm.org/doi/10.1145/3468784.3471604)

- **Comparative analysis** — Fedden, L. *Comparative Audio Analysis with
  WaveNet, MFCCs, UMAP, t-SNE and PCA*. (Practical reference for tuning
  perplexity and `n_neighbors` on audio data.)

- **Sound-AI** — *Sound-AI: A Pedagogical Tool for Exploring AI in Audio
  and Bioacoustic Research*. AAAI 2025. Pedagogical pipeline that
  combines MFCC / OpenL3 + PCA / t-SNE / UMAP — closely aligned with
  Auralis's design choices.

## Sound corpora

- **xeno-canto** — citizen-science bird recordings. Licensed
  CC-BY-NC-SA per recording — see each clip's license before
  redistributing.

- **Wikimedia Commons audio** — public-domain and CC-licensed; the
  per-file license is in the file's description page.

- **Internet Archive** — large public-domain audio archive (speeches,
  vintage music, NASA recordings).

- **NASA Audio Collection** — NASA-produced material is public domain
  unless otherwise noted; ideal for the "space" category.

- **Free Music Archive** — Creative Commons-licensed music; covers the
  "music" category.
