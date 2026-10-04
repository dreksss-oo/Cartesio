# Il linguaggio di Cartesio

Ogni canale ha due funzioni: **suono** `f(x, t)` e **composizione** `y(x)`; il tempo è `bpm(b)`. Si può scrivere in testo libero, con la sintassi di Desmos o in LaTeX (anche incollando).

| Dove | Variabili | Significato |
|---|---|---|
| Suono | `x`, `t` | fase dell'onda in radianti (0 → 2π) · secondi dall'inizio della nota |
| Composizione | `x` | beat del pattern; `y` = semitoni (0 = nota base). `y` non definita = silenzio · lista = accordo |
| Tempo | `b` | beat assoluto; il risultato sono i bpm |

## Sintassi

- Operatori: `+ − · × / ÷ ^ ** mod % !`, `|x|`, `√`, `²` `³`, `⌊x⌋ ⌈x⌉`, confronti `< ≤ = ≠ ≥ >` anche a catena, `and or not`.
- Moltiplicazione implicita: `2x`, `3sin(x)`, `xsin x`.
- A tratti: `{x < 2: 0, x < 4: 7, 12}` · `a if c else b` · `\begin{cases} … \end{cases}`.
- Definizioni su righe separate: `r(n) = seq(n, 0, -4, 3, -2)` e poi `y = r(x/4)`.
- Somme e prodotti: `Σ_{k=1}^{10} sin(kx)/k`, `sum(k, 1, 10, …)`, `prod(…)`.
- Liste: `[0, 4, 7]` (le operazioni si applicano a ogni elemento).

## Funzioni

| Gruppo | Funzioni |
|---|---|
| Matematica | `sin cos tan sec csc cot`, `arcsin…`, `sinh…`, `exp ln log log_2 logb`, `sqrt cbrt root(n,x)`, `abs sgn floor ceil round(x,d) frac mod`, `min max gcd lcm`, `nCr nPr fact gamma beta erf erfc besselj(n,x)`, `sinc sigmoid hypot atan2`, `deg rad` |
| Interpolazione | `lerp mix map(v,a,b,c,d) wrap(v,a,b) clamp clip smoothstep easein easeout easeinout between(x,a,b)` |
| Numeri | `isprime(n) prime(k) fib(n) chaos(i, r)` (mappa logistica: sequenze caotiche deterministiche) |
| Ritmo | `seq(i, …)` · `every(b, p, fase)` · `pulse(b, p, w)` · `gate(b, p, w)` · `euclid(i, k, n, rot)` · `phasor(b, p)` · `lfo(b, freq)` · `chance(i, p)` · `rnd(i)` · `bar(b)` · `beatin(b)` |
| Altezze | `mtof ftom semi(n)` · `scale(grado, …passi)` · `quant(semitoni, …passi)` · `major minor penta minpenta blues dorian phrygian lydian mixolydian locrian harmonic melodic whole chromatic` (grado → semitoni) |
| Accordi (liste) | `triad(r, ±1) chmaj chmin chdim chaug sus2 sus4 chmaj7 chmin7 chdom7 power octaves(r, n)` |
| Forme d'onda | `sin sq saw tri` · `pwm(x, w)` · `fm(x, rapporto, indice)` · `am(x, r, d)` · `harm(x, n)` · `odd(x, n)` · `supersaw(x, n, detune)` · `noise` · `rumore(r, t, seed)` |
| Modellare | `fold(v)` (wavefolder) · `crush(v, bit)` · `quantize(v, passo)` · `tanh` (saturazione) |
| Inviluppi (t in s) | `decay(t, d) ad(t, a, d) perc(t, d) adsr(t, a, d, s, durata, r) swell(t, a)` |
| Bit (bytebeat) | `band bor bxor shl shr bit(i, k)` |
| Liste | `range(a, b, passo) rev sort rotate(L, k) repeat(L, n) shuffle(L, seed) first last count length at(L, i) total mean median std` |
| Tabelle | `tab(L, u)` (lettura continua) · `integ(L, u)` (integrale) |
| Costanti | `π τ e φ ∞` |

## Esempi

```text
y = {x mod 1 < 0.5: minor(seq(x, 0, 2, 4, 7))}          arpeggio in minore
y = chmin7(seq(x/4, 0, -4, 3, -2))                        giro di accordi, uno per battuta
y = {euclid(4x, 5, 16) = 1: penta(rnd(4x)·8)}             ritmo euclideo su scala pentatonica
f = fm(x, 2, 3·decay(t, 0.4))·perc(t, 0.6)                campana FM
f = fold(2.5·sin(x))·adsr(t, 0.01, 0.2, 0.6, 0.4, 0.3)    wavefolding con inviluppo
f = supersaw(x, 7, 0.012)·swell(t, 0.3)                    pad
bpm(b) = 120 + 20·smoothstep(0, 32, b)                     accelerando (nel campo bpm si scrive solo la parte dopo «=»)
```
