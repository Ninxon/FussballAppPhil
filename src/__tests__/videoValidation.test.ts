import {
  MAX_UPLOAD_BYTES,
  STORAGE_QUOTA_BYTES,
  formatBytes,
  safeExtension,
  validateVideoUpload,
  storageLevel,
  libraryStoragePath,
} from '../admin/services/videoValidation';

const MB = 1024 * 1024;
const GB = 1024 * MB;

const file = (over: Partial<{ name: string; size: number; type: string }> = {}) => ({
  name: 'training.mp4', size: 20 * MB, type: 'video/mp4', ...over,
});

describe('formatBytes', () => {
  it('formatiert mit deutschem Dezimalkomma', () => {
    expect(formatBytes(1.4 * GB)).toBe('1,4 GB');
  });

  it('nutzt die passende Einheit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2 * 1024)).toBe('2 KB');
    expect(formatBytes(50 * MB)).toBe('50 MB');
  });

  it('rundet ab 100 auf ganze Zahlen', () => {
    expect(formatBytes(150 * MB)).toBe('150 MB');
  });

  it('faengt unsinnige Werte ab', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('safeExtension', () => {
  it('uebernimmt erlaubte Endungen in Kleinschreibung', () => {
    expect(safeExtension('Passen.MP4')).toBe('mp4');
    expect(safeExtension('clip.mov')).toBe('mov');
    expect(safeExtension('a.mkv')).toBe('mkv');
  });

  it('faellt bei unbekannter Endung auf mp4 zurueck', () => {
    expect(safeExtension('schadcode.exe')).toBe('mp4');
    expect(safeExtension('ohne-endung')).toBe('mp4');
  });

  it('laesst sich nicht durch Pfadanteile austricksen', () => {
    // Kein '..' oder '/' darf in den Objektpfad gelangen.
    expect(safeExtension('../../etc/passwd')).toBe('mp4');
    expect(libraryStoragePath('abc', '../../etc/passwd')).toBe('library/abc.mp4');
  });
});

describe('validateVideoUpload — Titel', () => {
  it('verlangt einen Titel', () => {
    expect(validateVideoUpload({ title: '   ', mode: 'file', file: file() }))
      .toMatch(/Titel/);
  });
});

describe('validateVideoUpload — Datei', () => {
  it('akzeptiert eine gueltige Datei', () => {
    expect(validateVideoUpload({ title: 'Passen', mode: 'file', file: file() })).toBeNull();
  });

  it('verlangt eine Datei', () => {
    expect(validateVideoUpload({ title: 'Passen', mode: 'file', file: null }))
      .toMatch(/Videodatei/);
  });

  it('lehnt leere Dateien ab', () => {
    expect(validateVideoUpload({ title: 'Passen', mode: 'file', file: file({ size: 0 }) }))
      .toMatch(/leer/);
  });

  it('lehnt zu grosse Dateien ab und nennt beide Groessen', () => {
    const msg = validateVideoUpload({
      title: 'Passen', mode: 'file', file: file({ size: MAX_UPLOAD_BYTES + 1 }),
    });
    expect(msg).toContain('200 MB');
    expect(msg).toMatch(/1080p/);
  });

  it('laesst die Grenze selbst noch zu', () => {
    expect(validateVideoUpload({
      title: 'Passen', mode: 'file', file: file({ size: MAX_UPLOAD_BYTES }),
    })).toBeNull();
  });

  it('lehnt fremde Formate ab', () => {
    expect(validateVideoUpload({
      title: 'Passen', mode: 'file', file: file({ type: 'application/pdf' }),
    })).toMatch(/Format/);
  });

  it('akzeptiert leeren MIME-Typ (manche Browser liefern keinen)', () => {
    expect(validateVideoUpload({
      title: 'Passen', mode: 'file', file: file({ type: '' }),
    })).toBeNull();
  });
});

describe('validateVideoUpload — URL', () => {
  it('akzeptiert http und https', () => {
    expect(validateVideoUpload({ title: 'A', mode: 'url', url: 'https://youtu.be/x' })).toBeNull();
    expect(validateVideoUpload({ title: 'A', mode: 'url', url: 'http://example.com/v.mp4' })).toBeNull();
  });

  it('verlangt eine URL', () => {
    expect(validateVideoUpload({ title: 'A', mode: 'url', url: '  ' })).toMatch(/URL/);
  });

  it('lehnt Adressen ohne Protokoll ab', () => {
    expect(validateVideoUpload({ title: 'A', mode: 'url', url: 'youtu.be/x' })).toMatch(/http/);
  });

  it('prueft im URL-Modus keine Datei', () => {
    expect(validateVideoUpload({
      title: 'A', mode: 'url', url: 'https://youtu.be/x', file: file({ size: 5 * GB }),
    })).toBeNull();
  });
});

describe('validateVideoUpload — Bibliothek', () => {
  it('braucht weder Datei noch URL', () => {
    expect(validateVideoUpload({ title: 'Vorhandenes Video', mode: 'library' })).toBeNull();
  });
});

describe('storageLevel', () => {
  it('meldet ok unterhalb von 70 Prozent', () => {
    expect(storageLevel(50 * GB)).toBe('ok');
  });

  it('warnt ab 70 Prozent', () => {
    expect(storageLevel(0.7 * STORAGE_QUOTA_BYTES)).toBe('warn');
    expect(storageLevel(80 * GB)).toBe('warn');
  });

  it('meldet kritisch ab 90 Prozent', () => {
    expect(storageLevel(0.9 * STORAGE_QUOTA_BYTES)).toBe('critical');
    expect(storageLevel(200 * GB)).toBe('critical');
  });

  it('kommt mit Quota 0 klar', () => {
    expect(storageLevel(1, 0)).toBe('ok');
  });
});

describe('libraryStoragePath', () => {
  it('leitet den Pfad aus der Video-Id ab', () => {
    expect(libraryStoragePath('11111111-2222-3333-4444-555555555555', 'Clip.MOV'))
      .toBe('library/11111111-2222-3333-4444-555555555555.mov');
  });
});
