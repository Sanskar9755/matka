function generatePannas() {
  const single = {}, double = {}, triple = {};
  for(let i=0;i<=9;i++){single[i]=[];double[i]=[];triple[i]=[];}
  for(let a=0;a<=9;a++) for(let b=a;b<=9;b++) for(let c=b;c<=9;c++){
    const ank=(a+b+c)%10;
    const p=String(a)+String(b)+String(c);
    if(a===b&&b===c) triple[ank].push(p);
    else if(a===b||b===c||a===c) double[ank].push(p);
    else single[ank].push(p);
  }
  return {single,double,triple};
}
const d = generatePannas();
console.log('Digit 1 SP:', d.single[1].join(', '));
console.log('Digit 2 SP:', d.single[2].join(', '));
console.log('Digit 0 DP:', d.double[0].join(', '));
console.log('Triple pannas:', Object.values(d.triple).flat().join(', '));
console.log('Total SP:', Object.values(d.single).flat().length);
console.log('Total DP:', Object.values(d.double).flat().length);
console.log('Total TP:', Object.values(d.triple).flat().length);
