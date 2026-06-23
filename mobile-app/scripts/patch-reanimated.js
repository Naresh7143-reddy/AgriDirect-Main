/**
 * Postinstall patches for react-native-reanimated + React Native 0.85:
 *
 * 1. hermes-engine::libhermes was renamed to hermesvm in RN 0.85
 * 2. CxxModuleWrapper.h was removed
 * 3. ContextContainer::Shared was removed
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rnReanimated = path.join(__dirname, '../node_modules/react-native-reanimated');

// --- Patch 1: libhermes -> hermesvm ---
const workletsFile = path.join(rnReanimated, 'android/src/main/cpp/worklets/CMakeLists.txt');
if (fs.existsSync(workletsFile)) {
  let c = fs.readFileSync(workletsFile, 'utf8');
  if (c.includes('hermes-engine::libhermes')) {
    fs.writeFileSync(workletsFile, c.replace(/hermes-engine::libhermes/g, 'hermes-engine::hermesvm'));
    console.log('[patch] hermes-engine::libhermes -> hermesvm');
  }
}

// --- Patch 2: ContextContainer::Shared -> std::shared_ptr<const ContextContainer> ---
const contextFiles = [
  path.join(rnReanimated, 'Common/cpp/reanimated/LayoutAnimations/LayoutAnimationsProxy.h'),
];
contextFiles.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    if (c.includes('ContextContainer::Shared')) {
      fs.writeFileSync(f, c.replace(/ContextContainer::Shared/g, 'std::shared_ptr<const ContextContainer>'));
      console.log('[patch] ContextContainer::Shared -> std::shared_ptr in', path.basename(f));
    }
  }
});

// --- Patch 3: Create CxxModuleWrapper.h shim ---
const gradleCache = path.join(process.env.USERPROFILE || process.env.HOME, '.gradle/caches');
if (fs.existsSync(gradleCache)) {
  try {
    const result = execSync(
      `find "${gradleCache.replace(/\\/g, '/')}" -name "CxxModuleWrapperBase.h" 2>/dev/null`,
      { encoding: 'utf8', shell: 'bash' }
    ).trim();
    if (result) {
      const jniDir = path.dirname(result);
      const shimPath = path.join(jniDir, 'CxxModuleWrapper.h');
      if (!fs.existsSync(shimPath)) {
        fs.writeFileSync(shimPath,
          '// Compat shim: CxxModuleWrapper.h removed in RN 0.85\n#pragma once\n#include <react/jni/CxxModuleWrapperBase.h>\n'
        );
        console.log('[patch] Created CxxModuleWrapper.h shim');
      }
    }
  } catch {}
}

console.log('[patch] Done.');
