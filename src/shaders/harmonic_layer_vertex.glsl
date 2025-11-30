// Vertex shader for rendering individual harmonic layers
uniform float coefficients[25];
uniform int harmonicIndex; // Which harmonic coefficient to visualize
uniform float displacementScale;
uniform float layerOffset; // Radial offset for this layer

varying float vValue;
varying vec3 vNormal;

const float PI = 3.14159265359;

// Factorial helper
float factorial(int n) {
  if (n <= 1) return 1.0;
  float result = 1.0;
  for (int i = 2; i <= n; i++) {
    result *= float(i);
  }
  return result;
}

// Associated Legendre polynomial P_l^m(x)
float legendreP(int l, int m, float x) {
  if (l == 0) return 1.0;
  if (l == 1 && m == 0) return x;
  if (l == 1 && m == 1) return -sqrt(1.0 - x * x);

  float x2 = x * x;
  float sx = sqrt(1.0 - x2);

  if (l == 2) {
    if (m == 0) return 0.5 * (3.0 * x2 - 1.0);
    if (m == 1) return -3.0 * x * sx;
    if (m == 2) return 3.0 * (1.0 - x2);
  }

  if (l == 3) {
    if (m == 0) return 0.5 * x * (5.0 * x2 - 3.0);
    if (m == 1) return -1.5 * sx * (5.0 * x2 - 1.0);
    if (m == 2) return 15.0 * x * (1.0 - x2);
    if (m == 3) return -15.0 * sx * (1.0 - x2);
  }

  if (l == 4) {
    float x4 = x2 * x2;
    if (m == 0) return 0.125 * (35.0 * x4 - 30.0 * x2 + 3.0);
    if (m == 1) return -2.5 * x * sx * (7.0 * x2 - 3.0);
    if (m == 2) return 7.5 * (1.0 - x2) * (7.0 * x2 - 1.0);
    if (m == 3) return -105.0 * x * sx * (1.0 - x2);
    if (m == 4) return 105.0 * (1.0 - x2) * (1.0 - x2);
  }

  return 0.0;
}

// Real spherical harmonic Y_l^m(theta, phi)
float sphericalHarmonic(int l, int m, float theta, float phi) {
  float cosTheta = cos(theta);
  int absM = abs(m);

  // Normalization constant
  float K = sqrt((2.0 * float(l) + 1.0) / (4.0 * PI) *
                 factorial(l - absM) / factorial(l + absM));

  float P = legendreP(l, absM, cosTheta);

  if (m > 0) {
    return K * P * cos(float(m) * phi) * sqrt(2.0);
  } else if (m < 0) {
    return K * P * sin(float(-m) * phi) * sqrt(2.0);
  } else {
    return K * P;
  }
}

// Evaluate single spherical harmonic by index
float evaluateSingleSH(vec3 dir, int targetIdx) {
  float theta = acos(clamp(dir.z, -1.0, 1.0));
  float phi = atan(dir.y, dir.x);

  int idx = 0;
  for (int l = 0; l <= 4; l++) {
    for (int m = -l; m <= l; m++) {
      if (idx == targetIdx) {
        return coefficients[idx] * sphericalHarmonic(l, m, theta, phi);
      }
      idx++;
    }
  }
  return 0.0;
}

void main() {
  vec3 dir = normalize(position);

  // Evaluate this specific harmonic
  float shValue = evaluateSingleSH(dir, harmonicIndex);

  // Base radius with layer offset (creates stacked mountain effect)
  float baseRadius = 1.0 + layerOffset;
  float radius = baseRadius + shValue * displacementScale;

  vec3 newPosition = dir * radius;

  // Compute normal using finite differences
  float eps = 0.001;
  float theta = acos(clamp(dir.z, -1.0, 1.0));
  float phi = atan(dir.y, dir.x);

  // Perturb theta
  float thetaPlus = theta + eps;
  vec3 dirThetaPlus = vec3(
    sin(thetaPlus) * cos(phi),
    sin(thetaPlus) * sin(phi),
    cos(thetaPlus)
  );
  float shThetaPlus = evaluateSingleSH(dirThetaPlus, harmonicIndex);
  vec3 posThetaPlus = dirThetaPlus * (baseRadius + shThetaPlus * displacementScale);

  // Perturb phi
  float phiPlus = phi + eps;
  vec3 dirPhiPlus = vec3(
    sin(theta) * cos(phiPlus),
    sin(theta) * sin(phiPlus),
    cos(theta)
  );
  float shPhiPlus = evaluateSingleSH(dirPhiPlus, harmonicIndex);
  vec3 posPhiPlus = dirPhiPlus * (baseRadius + shPhiPlus * displacementScale);

  // Compute tangent vectors and normal
  vec3 tangentTheta = (posThetaPlus - newPosition) / eps;
  vec3 tangentPhi = (posPhiPlus - newPosition) / eps;
  vec3 normal = cross(tangentTheta, tangentPhi);

  vValue = shValue;
  vNormal = normalize(normal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
