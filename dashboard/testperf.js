const iterations = 10000000;

const obj = {
    field: "Value"
}
const fieldName = "field";
const acc_by_str = function () {
    return obj[fieldName];
}
const acc_by_obj = function () {
    return obj.field;
}

console.time('Object key');
for(var i = 0; i < iterations; i++ ){
    acc_by_obj();
};
console.timeEnd('Object key')

console.time('string key');
for(var i = 0; i < iterations; i++ ){
    acc_by_str();
};
console.timeEnd('string key')
